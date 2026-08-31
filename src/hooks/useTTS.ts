"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { usePathname } from "next/navigation";

// --- Types ---

export interface TTSOptions {
  /** Language for speech synthesis */
  language?: "zh-CN" | "zh-HK" | "mandarin" | "cantonese";
  /** Speaking rate */
  rate?: "x-slow" | "slow" | "medium" | "fast";
  /** Phoneme annotation for polyphonic character disambiguation (pinyin/jyutping) */
  phoneme?: string;
}

export interface UseTTSReturn {
  /** Speak the given text. Stops any current playback first. */
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  /** Preload TTS audio into client cache without playing. */
  preload: (text: string, options?: TTSOptions) => Promise<void>;
  /** Stop current playback immediately */
  stop: () => void;
  /** Pause current playback, keeping position (resume() continues). */
  pause: () => void;
  /** Resume playback paused with pause(). */
  resume: () => void;
  /** True while playback is paused (resume() will continue it). */
  isPaused: boolean;
  /** True while fetching audio from API */
  isLoading: boolean;
  /** True while audio is actively playing */
  isPlaying: boolean;
  /** Error message from last speak attempt, null if none */
  error: string | null;
}

// A page can render several useTTS consumers at once (for example, one per
// listening-test question). Keep playback exclusive across hook instances so
// two answers never talk over each other.
let stopActiveTts: (() => void) | null = null;
let settleActiveBrowserSpeech: (() => void) | null = null;

// --- Cache Key Builder ---

/**
 * Build a client-side cache key from speak parameters.
 * Simple string concatenation — no hashing needed on client
 * (the server handles cache key hashing for Redis).
 */
function buildClientCacheKey(
  text: string,
  language: string,
  rate: string,
  phoneme: string
): string {
  return `${text}:${language}:${rate}:${phoneme}`;
}

// --- Browser Speech Synthesis Fallback ---

// Cantonese must keep the configured teaching voice. A device's zh-HK voice
// may be a different accent/quality even when its locale is technically valid.
function allowsDeviceVoice(language: string): boolean {
  return language !== "zh-HK" && language !== "cantonese";
}

/** Map TTS language options to BCP-47 lang tags for browser speechSynthesis */
function getBrowserLang(
  language: string
): string {
  switch (language) {
    case "zh-HK":
    case "cantonese":
      return "zh-HK";
    default:
      return "zh-CN";
  }
}

/**
 * Load the device voice list, waiting briefly for the async `voiceschanged`
 * event if it hasn't populated yet (Chrome returns [] on first call).
 */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", done);
      resolve(window.speechSynthesis.getVoices());
    };
    window.speechSynthesis.addEventListener("voiceschanged", done);
    // Some platforms never fire voiceschanged — don't hang forever.
    setTimeout(done, 1000);
  });
}

/**
 * Find a device voice that genuinely matches the requested language.
 * BCP-47 tags are compared case-insensitively and with `_`/`-` normalized
 * (Android reports e.g. "zh_HK_#Hant").
 */
function findBrowserVoice(
  voices: SpeechSynthesisVoice[],
  lang: string,
): SpeechSynthesisVoice | null {
  const normalize = (v: string) => v.replace(/_/g, "-").toLowerCase();
  const wanted = normalize(lang);
  return (
    voices.find((v) => normalize(v.lang) === wanted) ??
    voices.find((v) => normalize(v.lang).startsWith(wanted)) ??
    // Cantonese is also tagged "yue" (e.g. "yue-HK") on some platforms.
    (wanted === "zh-hk"
      ? (voices.find((v) => normalize(v.lang).startsWith("yue")) ?? null)
      : null)
  );
}

/**
 * Speak text using the browser's built-in speechSynthesis API.
 *
 * Only speaks when the device actually has a voice for the requested
 * language. This matters most for Cantonese: most devices ship no zh-HK
 * voice, and letting the default (Mandarin or English) voice read Cantonese
 * text produces garbled, wrong-language audio that students report as
 * "the audio sounds broken" — worse than no audio at all.
 * Returns a promise that resolves when speech ends.
 */
async function browserSpeak(
  text: string,
  language: string,
  rate: string
): Promise<void> {
  if (!("speechSynthesis" in window)) {
    throw new Error("Speech synthesis not supported");
  }
  const lang = getBrowserLang(language);
  const voice = findBrowserVoice(await loadVoices(), lang);
  if (!voice) {
    throw new Error(`No ${lang} voice available on this device`);
  }
  settleActiveBrowserSpeech?.();
  return new Promise((resolve, reject) => {
    window.speechSynthesis.cancel();
    // Strip bracketed placeholders like [your name] so they aren't spoken
    const spokenText = text.replace(/\[[^\]]+\]/g, "");
    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = lang;
    utterance.voice = voice;
    utterance.rate =
      rate === "x-slow" ? 0.6 : rate === "slow" ? 0.8 : rate === "fast" ? 1.45 : 1;

    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      utterance.onend = null;
      utterance.onerror = null;
      settleActiveBrowserSpeech = null;
      if (error) reject(error);
      else resolve();
    };
    settleActiveBrowserSpeech = () => finish();
    utterance.onend = () => finish();
    utterance.onerror = (e) => finish(e);
    window.speechSynthesis.speak(utterance);
  });
}

// --- Hook ---

/**
 * Hook for client-side TTS playback via the /api/tts endpoint.
 *
 * Provides speak/stop controls, loading/playing/error state,
 * and client-side blob URL caching to avoid re-fetching.
 *
 * Only one audio can play at a time — calling speak() while audio
 * is playing stops the current audio before starting the new one.
 *
 * Blob URLs are revoked on component unmount to prevent memory leaks.
 *
 * @example
 * ```tsx
 * const { speak, stop, isLoading, isPlaying, error } = useTTS();
 *
 * return (
 *   <button
 *     onClick={() => speak("你好", { language: "zh-CN" })}
 *     disabled={isLoading}
 *   >
 *     {isPlaying ? "Playing..." : isLoading ? "Loading..." : "Listen"}
 *   </button>
 * );
 * ```
 */
export function useTTS(): UseTTSReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs persist across renders within the component lifecycle
  const cacheRef = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playbackResolveRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const fetchAndCacheAudio = useCallback(
    async (text: string, options?: TTSOptions) => {
      const language = options?.language ?? "zh-CN";
      const rate = options?.rate ?? "medium";
      const phoneme = options?.phoneme ?? "";
      const key = buildClientCacheKey(text, language, rate, phoneme);

      const cached = cacheRef.current.get(key);
      if (cached) {
        return { key, url: cached, language, rate };
      }

      const controller = new AbortController();
      // MiniMax permits 15 seconds for synthesis. Do not abort a healthy
      // Cantonese request before that server deadline (allow transport time).
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        allowsDeviceVoice(language) ? 12000 : 20000,
      );
      let response: Response;
      try {
        response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            text,
            language,
            rate,
            ...(phoneme ? { phoneme } : {}),
          }),
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          const timeoutErr = new Error("TTS request timeout");
          (timeoutErr as Error & { status?: number }).status = 408;
          throw timeoutErr;
        }
        throw err;
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const error = new Error(`TTS request failed (${response.status})`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      cacheRef.current.set(key, url);
      return { key, url, language, rate };
    },
    [],
  );

  /**
   * Stop current audio playback immediately.
   * Removes event listeners and resets the audio ref.
   */
  const stop = useCallback(function stopThisTts() {
    const resolvePlayback = playbackResolveRef.current;
    playbackResolveRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    // Stopping must also settle speak(). Repeated-play flows await that
    // promise, and previously remained hung forever after the user pressed
    // Stop because the media event handlers had already been removed.
    resolvePlayback?.();
    // Also stop browser speechSynthesis if active
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    settleActiveBrowserSpeech?.();
    setIsPlaying(false);
    setIsPaused(false);
    if (stopActiveTts === stopThisTts) stopActiveTts = null;
  }, []);

  /** Pause current playback in place; resume() picks up where it left off. */
  const pause = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      setIsPaused(true);
    }
    if ("speechSynthesis" in window && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      setIsPaused(true);
    }
  }, []);

  /** Resume playback previously paused with pause(). */
  const resume = useCallback(() => {
    if (audioRef.current && audioRef.current.paused) {
      const attempt = audioRef.current.play();
      if (attempt && typeof attempt.catch === "function") attempt.catch(() => {});
    }
    if ("speechSynthesis" in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    setIsPaused(false);
  }, []);

  /**
   * Speak the given text using the /api/tts endpoint.
   *
   * 1. Stops any currently playing audio (no overlap).
   * 2. Checks client-side blob URL cache.
   * 3. On cache miss, fetches from API and caches the blob URL.
   * 4. Plays audio via new Audio(blobUrl).
   */
  const speak = useCallback(
    async (text: string, options?: TTSOptions) => {
      try {
        // 1. Stop playback from this or any other hook instance.
        if (stopActiveTts && stopActiveTts !== stop) stopActiveTts();
        stop();
        stopActiveTts = stop;
        setIsPaused(false);

        // 2. Reset error state
        setError(null);

        // 3. Build cache key and resolve URL
        const language = options?.language ?? "zh-CN";
        const rate = options?.rate ?? "medium";
        const phoneme = options?.phoneme ?? "";
        const key = buildClientCacheKey(text, language, rate, phoneme);
        let url = cacheRef.current.get(key);

        // Cached path should remain synchronous so click activation is preserved.
        if (!url) {
          setIsLoading(true);
          try {
            const resolved = await fetchAndCacheAudio(text, options);
            url = resolved.url;
          } catch (err) {
            if (mountedRef.current) setIsLoading(false);
            const status = (err as { status?: number })?.status;

            // Rate limit — no fallback
            if (status === 429) {
              setError("Too many requests. Please wait a moment.");
              return;
            }
            if (status === 401) {
              setError("Please sign in to use audio.");
              return;
            }

            if (!allowsDeviceVoice(language)) {
              if (mountedRef.current) {
                setError("Cantonese audio is temporarily unavailable. Please try again.");
                setIsPlaying(false);
              }
              return;
            }

            // Server TTS failed — try the device voice, but only if a real
            // voice for this language exists (browserSpeak enforces that).
            try {
              if (mountedRef.current) setIsPlaying(true);
              await browserSpeak(text, language, rate);
              if (mountedRef.current) setIsPlaying(false);
            } catch {
              if (mountedRef.current) {
                setError("Audio is temporarily unavailable. Please try again.");
                setIsPlaying(false);
              }
            }
            return;
          }
        }

        if (mountedRef.current) {
          setIsLoading(false);
        }

        // Guard: component may have unmounted during fetch
        if (!mountedRef.current) return;

        // 5. Create Audio element and play
        const audio = new Audio(url);
        audioRef.current = audio;
        setIsPlaying(true);

        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (mountedRef.current) {
            setIsPlaying(false);
          }
          audioRef.current = null;
        };

        const playbackDone = new Promise<void>((resolve) => {
          playbackResolveRef.current = resolve;
          audio.onended = () => {
            finish();
            playbackResolveRef.current = null;
            resolve();
          };

          audio.onerror = () => {
            if (mountedRef.current) {
              setError("Audio playback failed.");
            }
            finish();
            playbackResolveRef.current = null;
            resolve();
          };
        });

        const playStarted = await audio.play().catch((err: unknown) => {
          // Handle autoplay policy restrictions
          if (
            err instanceof DOMException &&
            err.name === "NotAllowedError"
          ) {
            if (!allowsDeviceVoice(language)) {
              // The fetched voice is already cached. A second tap can play it
              // synchronously with user activation; never change the voice.
              if (mountedRef.current) {
                setError("Tap again to play Cantonese audio.");
                setIsPlaying(false);
              }
              return false;
            }
            // First playback after async fetch can be blocked by browser policy.
            // Fall back immediately to device speech so first click still produces sound.
            browserSpeak(text, language, rate)
              .then(() => {
                if (mountedRef.current) {
                  setIsPlaying(false);
                }
              })
              .catch(() => {
                if (mountedRef.current) {
                  setError("Tap to enable audio playback.");
                  setIsPlaying(false);
                }
              });
            return false;
          } else {
            if (mountedRef.current) {
              setError("Audio playback failed.");
              setIsPlaying(false);
            }
            return false;
          }
        });

        if (playStarted === false) {
          finish();
          playbackResolveRef.current = null;
          if (stopActiveTts === stop) stopActiveTts = null;
          return;
        }

        await playbackDone;
        if (stopActiveTts === stop) stopActiveTts = null;
      } catch {
        // Unexpected error (network failure, etc.) — try the device voice,
        // but only if a real voice for this language exists.
        if (mountedRef.current) {
          setIsLoading(false);
          try {
            const language = options?.language ?? "zh-CN";
            const rate = options?.rate ?? "medium";
            if (!allowsDeviceVoice(language)) {
              setError("Cantonese audio is temporarily unavailable. Please try again.");
              setIsPlaying(false);
              return;
            }
            setIsPlaying(true);
            await browserSpeak(text, language, rate);
            if (mountedRef.current) setIsPlaying(false);
          } catch {
            if (mountedRef.current) {
              setError("Audio is temporarily unavailable. Please try again.");
              setIsPlaying(false);
            }
          }
        }
      }
    },
    [fetchAndCacheAudio, stop]
  );

  const preload = useCallback(
    async (text: string, options?: TTSOptions) => {
      try {
        await fetchAndCacheAudio(text, options);
      } catch {
        // best-effort preload
      }
    },
    [fetchAndCacheAudio],
  );

  // Stop audio when navigating to a different page
  const pathname = usePathname();
  useEffect(() => {
    stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Cleanup on unmount: stop audio and revoke all blob URLs
  useEffect(() => {
    // Capture ref values inside the effect per React lint rules
    const cache = cacheRef.current;
    return () => {
      mountedRef.current = false;
      stop();
      // Revoke all cached blob URLs to prevent memory leaks
      cache.forEach((url) => {
        URL.revokeObjectURL(url);
      });
      cache.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { speak, preload, stop, pause, resume, isPaused, isLoading, isPlaying, error };
}
