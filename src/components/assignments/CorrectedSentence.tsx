"use client";

import { useMemo } from "react";
import { Loader2, Play, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTS } from "@/hooks/useTTS";

// ---------------------------------------------------------------------------
// Offset-based correction rendering.
//
// Renders a submitted Chinese sentence from structured correction ranges:
// untouched text renders normally, corrected ranges render with a red
// strikethrough and a green speech bubble (corrected Chinese + pinyin +
// English) inline underneath, tail pointing at the corrected part.
//
// Every character is wrapped in a span carrying its exact string offset
// (data-offset) so the reviewer UI can turn DOM selections back into
// [startOffset, endOffset) ranges.
// ---------------------------------------------------------------------------

export interface RenderableCorrection {
  id: string;
  startOffset: number;
  endOffset: number;
  suggestedChinese: string;
  suggestedPinyin: string;
  suggestedEnglish: string;
}

interface CorrectedSentenceProps {
  text: string;
  corrections: RenderableCorrection[];
  /** Show a remove (×) button on each bubble — reviewer editing mode. */
  onRemoveCorrection?: (correctionId: string) => void;
  className?: string;
}

function CorrectionBubble({
  correction,
  onRemove,
}: {
  correction: RenderableCorrection;
  onRemove?: (id: string) => void;
}) {
  const { speak, stop, isPlaying, isLoading } = useTTS();

  const handleSpeak = () => {
    if (isPlaying) {
      stop();
    } else {
      void speak(correction.suggestedChinese, {
        language: "zh-CN",
        rate: "medium",
      });
    }
  };

  return (
    <span className="relative mt-2.5 block w-max max-w-[280px] select-none rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-left">
      {/* Tail pointing up at the middle of the corrected part */}
      <span
        aria-hidden
        className="absolute -top-[7px] left-1/2 -ml-[6px] h-3 w-3 rotate-45 border-l border-t border-emerald-500/40 bg-emerald-500/10"
        style={{ backgroundClip: "padding-box" }}
      />
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(correction.id)}
          className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          title="Remove correction"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
      <span className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
          {correction.suggestedChinese}
        </span>
        <button
          type="button"
          onClick={handleSpeak}
          className="p-0.5 text-emerald-700/70 hover:text-emerald-700 dark:text-emerald-400/70 dark:hover:text-emerald-400"
          title={isPlaying ? "Stop audio" : "Play audio"}
        >
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isPlaying ? (
            <Square className="h-3 w-3" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </button>
      </span>
      {correction.suggestedPinyin && (
        <span className="block text-xs text-emerald-700/80 dark:text-emerald-400/80">
          {correction.suggestedPinyin}
        </span>
      )}
      {correction.suggestedEnglish && (
        <span className="block text-xs text-muted-foreground">
          {correction.suggestedEnglish}
        </span>
      )}
    </span>
  );
}

/** One character span carrying its exact offset for selection mapping. */
function CharSpans({
  text,
  baseOffset,
  className,
}: {
  text: string;
  baseOffset: number;
  className?: string;
}) {
  const chars: Array<{ char: string; offset: number }> = [];
  let i = 0;
  while (i < text.length) {
    const code = text.codePointAt(i)!;
    const size = code > 0xffff ? 2 : 1;
    chars.push({ char: text.slice(i, i + size), offset: baseOffset + i });
    i += size;
  }
  return (
    <>
      {chars.map(({ char, offset }) => (
        <span key={offset} data-offset={offset} className={className}>
          {char}
        </span>
      ))}
    </>
  );
}

export function CorrectedSentence({
  text,
  corrections,
  onRemoveCorrection,
  className,
}: CorrectedSentenceProps) {
  // Render segments in offset order; overlaps are prevented upstream.
  const segments = useMemo(() => {
    const sorted = [...corrections].sort(
      (a, b) => a.startOffset - b.startOffset,
    );
    const result: Array<
      | { kind: "plain"; start: number; text: string }
      | { kind: "corrected"; start: number; text: string; correction: RenderableCorrection }
    > = [];
    let cursor = 0;
    for (const correction of sorted) {
      const start = Math.max(0, Math.min(correction.startOffset, text.length));
      const end = Math.max(start, Math.min(correction.endOffset, text.length));
      if (start > cursor) {
        result.push({
          kind: "plain",
          start: cursor,
          text: text.slice(cursor, start),
        });
      }
      result.push({
        kind: "corrected",
        start,
        text: text.slice(start, end),
        correction,
      });
      cursor = end;
    }
    if (cursor < text.length) {
      result.push({ kind: "plain", start: cursor, text: text.slice(cursor) });
    }
    return result;
  }, [text, corrections]);

  return (
    <div className={cn("leading-loose", className)}>
      {segments.map((segment) =>
        segment.kind === "plain" ? (
          <CharSpans
            key={`plain-${segment.start}`}
            text={segment.text}
            baseOffset={segment.start}
            className="text-lg text-foreground"
          />
        ) : (
          <span
            key={`corrected-${segment.correction.id}`}
            className="mx-0.5 inline-flex flex-col items-center align-top"
          >
            <span>
              <CharSpans
                text={segment.text}
                baseOffset={segment.start}
                className="text-lg text-red-500 line-through decoration-red-500 decoration-2"
              />
            </span>
            <CorrectionBubble
              correction={segment.correction}
              onRemove={onRemoveCorrection}
            />
          </span>
        ),
      )}
    </div>
  );
}
