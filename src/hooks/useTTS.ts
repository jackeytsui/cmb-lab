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
  /** True while fetching audio from API */
  isLoading: boolean;
  /** True while audio is actively playing */
  isPlaying: boolean;
  /** Error message from last speak attempt, null if none */
  error: string | null;
}

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
 * Speak text using the browser's built-in speechSynthesis API.
 * Explicitly selects a matching voice for the requested language.
 * Returns a promise that resolves when speech ends.
 */
function browserSpeak(
  text: string,
  language: string,
  rate: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      reject(new Error("Speech synthesis not supported"));
      return;
    }
    window.speechSynthesis.cancel();
    // Strip bracketed placeholders like [your name] so they aren't spoken
    const spokenText = text.replace(/\[[^\]]+\]/g, "");
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const lang = getBrowserLang(language);
    utterance.lang = lang;
    utterance.rate =
      rate === "x-slow" ? 0.6 : rate === "slow" ? 0.8 : rate === "fast" ? 1.45 : 1;

    // Explicitly pick a voice matching the language so Cantonese doesn't
    // fall back to a Mandarin voice
    const voices = window.speechSynthesis.getVoices();
    const exactMatch = voices.find((v) => v.lang === lang);
    const prefixMatch = voices.find((v) => v.lang.startsWith(lang.slice(0, 5)));
    if (exactMatch) {
      utterance.voice = exactMatch;
    } else if (prefixMatch) {
      utterance.voice = prefixMatch;
    }

    utterance.onend = () => resolve();
    utterance.onerror = (e) => reject(e);
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
  const [error, setError] = useState<string | null>(null);

  // Refs persist across renders within the component lifecycle
  const cacheRef = useRef<Map<string, string>>(new Map());
  const audioRef = useRef<HTMLAudioElement | null>(null);
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
      const timeoutId = window.setTimeout(() => controller.abort(), 12000);
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
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current = null;
    }
    // Also stop browser speechSynthesis if active
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsPlaying(false);
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
        // 1. Stop any current playback to prevent overlap
        stop();

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

            // Server TTS failed — silently try browser fallback
            try {
              if (mountedRef.current) setIsPlaying(true);
              await browserSpeak(text, language, rate);
              if (mountedRef.current) setIsPlaying(false);
            } catch {
              if (mountedRef.current) {
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
          audio.onended = () => {
            finish();
            resolve();
          };

          audio.onerror = () => {
            if (mountedRef.current) {
              setError("Audio playback failed.");
            }
            finish();
            resolve();
          };
        });

        const playStarted = await audio.play().catch((err: unknown) => {
          // Handle autoplay policy restrictions
          if (
            err instanceof DOMException &&
            err.name === "NotAllowedError"
          ) {
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
          return;
        }

        await playbackDone;
      } catch {
        // Unexpected error (network failure, etc.) — try browser fallback
        if (mountedRef.current) {
          setIsLoading(false);
          try {
            const language = options?.language ?? "zh-CN";
            const rate = options?.rate ?? "medium";
            setIsPlaying(true);
            await browserSpeak(text, language, rate);
            if (mountedRef.current) setIsPlaying(false);
          } catch {
            if (mountedRef.current) {
              setError("Audio not available.");
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

  return { speak, preload, stop, isLoading, isPlaying, error };
}
