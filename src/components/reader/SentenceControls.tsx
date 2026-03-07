"use client";

/**
 * SentenceControls --- Per-sentence TTS play button with speed control
 * and tap-to-reveal AI translation.
 *
 * Renders inline controls at the end of each sentence in the reader:
 *   - Play/stop button for TTS read-aloud with loading spinner
 *   - Speed selector (slow / normal / fast)
 *   - Translate button with cached AI translation display
 *
 * Loading states use Loader2 spinner with disabled buttons.
 * Error states show friendly, recoverable messages.
 * All interactive buttons have aria-labels for accessibility.
 *
 * Translation results are cached in a parent-level Map to avoid
 * re-fetching the same sentence across re-renders.
 */

import { useState, useCallback } from "react";
import { Play, Square, Loader2, Languages, RotateCcw } from "lucide-react";

export interface SentenceControlsProps {
  /** The full text of this sentence */
  sentenceText: string;
  /** Language for TTS */
  language: "zh-CN" | "zh-HK";
  /** Called to speak the sentence at the given rate */
  onSpeak: (text: string, rate: "slow" | "medium" | "fast") => void;
  /** Whether TTS is currently playing this sentence */
  isPlaying: boolean;
  /** Whether TTS audio is loading for this sentence */
  isLoading: boolean;
  /** TTS error from useTTS hook (e.g. network failure) */
  ttsError?: string | null;
  /** Parent-level translation cache (sentence text -> English) */
  translationCache: Map<string, string>;
  /** Called when a translation is successfully fetched */
  onTranslationFetched: (text: string, translation: string) => void;
  /** Optional callback when play button is clicked */
  onPlayClick?: () => void;
  /** Optional onboarding target id for play button */
  playButtonTourId?: string;
  /** Disable sentence play button (e.g. while Play All is active) */
  disableSentencePlayback?: boolean;
}

export function SentenceControls({
  sentenceText,
  language,
  onSpeak,
  isPlaying,
  isLoading,
  ttsError,
  translationCache,
  onTranslationFetched,
  onPlayClick,
  playButtonTourId,
  disableSentencePlayback = false,
}: SentenceControlsProps) {
  // Suppress unused variable warning - language is part of the public API
  // and used by parent to determine which TTS voice to pass to onSpeak
  void language;

  const [rate, setRate] = useState<"slow" | "medium" | "fast">("medium");
  const [showTranslation, setShowTranslation] = useState(false);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(
    null,
  );

  // Get cached translation if available
  const cachedTranslation = translationCache.get(sentenceText);

  const handlePlay = useCallback(() => {
    onPlayClick?.();
    onSpeak(sentenceText, rate);
  }, [onPlayClick, onSpeak, sentenceText, rate]);

  const handleTranslate = useCallback(async () => {
    // If we already have a translation, just toggle visibility
    if (cachedTranslation) {
      setShowTranslation((prev) => !prev);
      return;
    }

    // Fetch translation
    setTranslationLoading(true);
    setTranslationError(null);

    try {
      const response = await fetch("/api/reader/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: sentenceText, language }),
      });

      if (!response.ok) {
        throw new Error("Translation request failed");
      }

      const data = await response.json();
      onTranslationFetched(sentenceText, data.translation);
      setShowTranslation(true);
    } catch {
      setTranslationError("Translation unavailable");
    } finally {
      setTranslationLoading(false);
    }
  }, [cachedTranslation, sentenceText, onTranslationFetched]);

  const handleRetryTranslation = useCallback(() => {
    setTranslationError(null);
    handleTranslate();
  }, [handleTranslate]);

  const displayTranslation = cachedTranslation ?? null;

  return (
    <span className="inline-flex flex-col">
      {/* Controls row */}
      <span className="inline-flex items-center gap-1 align-middle ml-1">
        {/* TTS Play/Stop button */}
        <button
          type="button"
          onClick={handlePlay}
          data-tour-id={playButtonTourId}
          disabled={isLoading || disableSentencePlayback}
          aria-label={
            isLoading
              ? "Loading audio"
              : disableSentencePlayback
                ? "Sentence playback disabled while Play All is active"
              : isPlaying
                ? "Stop reading"
                : "Read sentence aloud"
          }
          className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-cyan-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isPlaying ? (
            <Square className="size-3" />
          ) : (
            <Play className="size-3.5" />
          )}
        </button>

        {/* Speed selector */}
        <select
          value={rate}
          onChange={(e) =>
            setRate(e.target.value as "slow" | "medium" | "fast")
          }
          aria-label="Speaking speed"
          className="h-6 text-[10px] bg-background border border-input rounded text-muted-foreground px-1 appearance-none cursor-pointer hover:border-primary/40 focus:outline-none focus:border-primary"
        >
          <option value="slow">Slow</option>
          <option value="medium">Normal</option>
          <option value="fast">Fast</option>
        </select>

        {/* Translate button */}
        <button
          type="button"
          onClick={handleTranslate}
          disabled={translationLoading}
          aria-label="Translate to English"
          className="inline-flex items-center justify-center size-6 rounded hover:bg-muted text-muted-foreground hover:text-amber-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {translationLoading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Languages className="size-3.5" />
          )}
        </button>
      </span>

      {/* TTS error */}
      {ttsError && (
        <span className="text-[10px] text-red-500/80 ml-1">
          {ttsError}
        </span>
      )}

      {/* Translation display */}
      {showTranslation && displayTranslation && (
        <span className="text-sm text-muted-foreground italic ml-1 mt-0.5 opacity-0 animate-[fadeIn_200ms_ease-out_forwards]">
          {displayTranslation}
        </span>
      )}

      {/* Translation error with retry */}
      {translationError && (
        <span className="flex items-center gap-1.5 ml-1 mt-0.5">
          <span className="text-xs text-red-400/70 italic">
            Translation unavailable — try again later
          </span>
          <button
            type="button"
            onClick={handleRetryTranslation}
            aria-label="Retry translation"
            className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-cyan-500 transition-colors"
          >
            <RotateCcw className="size-2.5" />
            Retry
          </button>
        </span>
      )}
    </span>
  );
}
