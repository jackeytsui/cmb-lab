"use client";

import { useMemo } from "react";
import { Volume2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WordSpan, type AnnotationMode } from "@/components/reader/WordSpan";
import { segmentText } from "@/lib/segmenter";

interface TranscriptLineProps {
  ref?: React.Ref<HTMLDivElement>;
  isActive: boolean;
  text: string;
  startMs: number;
  onClick: () => void;
  annotationMode?: AnnotationMode;
  savedVocabSet?: Set<string>;
  /** Pre-segmented words from jieba (server-side). Falls back to Intl.Segmenter if not provided. */
  preSegments?: Array<{ text: string; isWordLike: boolean }>;
  /** Whether this line is within the active loop range */
  isInLoopRange?: boolean;
  /** Whether this line is the loop start point */
  isLoopStart?: boolean;
  /** Whether this line is the loop end point */
  isLoopEnd?: boolean;
  /** Called when TTS play button is clicked for this line */
  onTtsPlay?: () => void;
  /** Whether TTS is currently loading audio for this line */
  isTtsLoading?: boolean;
  /** Whether TTS is currently playing audio for this line */
  isTtsPlaying?: boolean;
  /** Whether the TTS button should be disabled (e.g. another line is playing) */
  isTtsDisabled?: boolean;
  /** English translation to display below the Chinese text */
  englishText?: string;
  /** Optional onboarding target id for this line row */
  lineTourId?: string;
  /** Optional onboarding target id for this line's TTS button */
  ttsButtonTourId?: string;
}

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function TranscriptLine({
  ref,
  isActive,
  text,
  startMs,
  onClick,
  annotationMode = "plain",
  savedVocabSet,
  isInLoopRange = false,
  isLoopStart = false,
  isLoopEnd = false,
  preSegments,
  onTtsPlay,
  isTtsLoading = false,
  isTtsPlaying = false,
  isTtsDisabled = false,
  englishText,
  lineTourId,
  ttsButtonTourId,
}: TranscriptLineProps) {
  const segments = useMemo(
    () => preSegments ?? segmentText(text),
    [preSegments, text]
  );

  return (
    <div
      ref={ref}
      data-tour-id={lineTourId}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // If user clicked on a word (has data-word attr), let the word popup
        // handle it via TranscriptPanel's event delegation — don't seek.
        const target = e.target as HTMLElement;
        if (target.closest?.("[data-word]")) return;
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "px-3 py-2 rounded-md cursor-pointer transition-colors text-sm hover:bg-muted relative flex items-start",
        // Priority: active (cyan) > loop range (amber) > normal (transparent)
        isActive
          ? "bg-cyan-900/30 border-l-2 border-cyan-400 text-foreground font-medium"
          : isInLoopRange
            ? "bg-amber-900/20 border-l-2 border-amber-400/50 text-foreground/90"
            : "text-muted-foreground border-l-2 border-transparent",
        annotationMode !== "plain" && "leading-[3]"
      )}
    >
      {/* Loop start/end badges */}
      {isLoopStart && (
        <span className="absolute -left-0.5 top-1 text-[10px] font-bold text-amber-400/80 select-none">
          A
        </span>
      )}
      {isLoopEnd && (
        <span className="absolute -left-0.5 bottom-1 text-[10px] font-bold text-amber-400/80 select-none">
          B
        </span>
      )}

      <span className="text-xs text-muted-foreground/70 mr-2 tabular-nums">
        {formatTimestamp(startMs)}
      </span>
      <span className="flex-1">
        <span className="block">
          {segments.map((seg, i) => (
            <span
              key={i}
              className={cn(
                seg.isWordLike &&
                  savedVocabSet?.has(seg.text) &&
                  "bg-emerald-500/10 border-b border-emerald-500/30 rounded-sm"
              )}
            >
              <WordSpan
                text={seg.text}
                index={i}
                isWordLike={seg.isWordLike}
                annotationMode={annotationMode}
              />
            </span>
          ))}
        </span>
        {englishText && (
          <span className="block text-sm text-muted-foreground mt-0.5 leading-snug">
            {englishText}
          </span>
        )}
      </span>

      {/* TTS play button -- right side of line */}
      {onTtsPlay && (
        <button
          type="button"
          data-tour-id={ttsButtonTourId}
          disabled={isTtsDisabled}
          onClick={(e) => {
            e.stopPropagation();
            onTtsPlay();
          }}
          className={cn(
            "ml-2 shrink-0 p-0.5 rounded transition-colors",
            isTtsDisabled
              ? "text-muted-foreground/30 cursor-not-allowed"
              : isTtsLoading
                ? "text-cyan-500"
                : isTtsPlaying
                  ? "text-cyan-500 animate-pulse"
                  : "text-muted-foreground/70 hover:text-foreground"
          )}
          aria-label={
            isTtsLoading
              ? "Loading audio"
              : isTtsPlaying
                ? "Playing audio"
                : "Play line audio"
          }
        >
          {isTtsLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}
