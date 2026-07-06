"use client";

import { useMemo } from "react";
import { Loader2, Play, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTTS } from "@/hooks/useTTS";
import { AnnotatedChar } from "@/components/assignments/AnnotatedChar";
import { AnnotatedSentence } from "@/components/assignments/AnnotatedSentence";
import { useSentenceAnnotations } from "@/components/assignments/useSentenceAnnotations";
import {
  ASSIGNMENT_CHAR_SIZE,
  type CharAnnotation,
} from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// Offset-based correction rendering, in the coaching-notes style.
//
// Every character — plain or struck-through — renders as a stacked column
// (pinyin on top of the character), so the pinyin always sits above its
// character and moves with it, including inside corrected ranges. Corrected
// ranges render the original text in red strikethrough with a green speech
// bubble hanging beneath (corrected Chinese + pinyin + English), tail pointing
// up at the corrected part.
//
// Each character span carries its exact UTF-16 offset (data-offset) so the
// reviewer UI can turn DOM selections back into [startOffset, endOffset)
// ranges; the pinyin above is select-none so it never enters the selection.
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
  /** Base Chinese character size in px (pinyin scales at ~half). */
  fontSize?: number;
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
    <span className="relative mt-2.5 block w-max max-w-[340px] select-none rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-left">
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
      <span className="flex items-start gap-1.5">
        {/* Suggested correction with pinyin stacked on top of each character */}
        <AnnotatedSentence text={correction.suggestedChinese} fontSize={20} />
        <button
          type="button"
          onClick={handleSpeak}
          className="mt-1 shrink-0 p-0.5 text-emerald-700/70 hover:text-emerald-700 dark:text-emerald-400/70 dark:hover:text-emerald-400"
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
      {correction.suggestedEnglish && (
        <span className="mt-0.5 block text-sm text-muted-foreground">
          {correction.suggestedEnglish}
        </span>
      )}
    </span>
  );
}

interface RenderGroup {
  correction: RenderableCorrection | null;
  chars: CharAnnotation[];
}

export function CorrectedSentence({
  text,
  corrections,
  fontSize = ASSIGNMENT_CHAR_SIZE,
  onRemoveCorrection,
  className,
}: CorrectedSentenceProps) {
  // Jieba-backed per-character annotations (same pipeline as the coaching
  // page), with a synchronous fallback for first paint.
  const annotations = useSentenceAnnotations(text);

  // Group consecutive characters by the correction they fall in (or none).
  // Corrections don't overlap (enforced upstream), so a correction's chars are
  // always contiguous in offset order.
  const groups = useMemo<RenderGroup[]>(() => {
    const sorted = [...corrections].sort(
      (a, b) => a.startOffset - b.startOffset,
    );
    const correctionAt = (offset: number) =>
      sorted.find((c) => offset >= c.startOffset && offset < c.endOffset) ??
      null;

    const result: RenderGroup[] = [];
    for (const ann of annotations) {
      const corr = correctionAt(ann.offset);
      const last = result[result.length - 1];
      if (last && (last.correction?.id ?? null) === (corr?.id ?? null)) {
        last.chars.push(ann);
      } else {
        result.push({ correction: corr, chars: [ann] });
      }
    }
    return result;
  }, [annotations, corrections]);

  return (
    <div className={cn("leading-relaxed", className)}>
      {groups.map((group, gi) =>
        group.correction ? (
          <span
            key={`corrected-${group.correction.id}-${gi}`}
            className="mx-0.5 inline-flex flex-col items-center align-top"
          >
            <span className="inline-flex items-end">
              {group.chars.map((ann) => (
                <AnnotatedChar
                  key={ann.offset}
                  ann={ann}
                  fontSize={fontSize}
                  struck
                  dataOffset={ann.offset}
                />
              ))}
            </span>
            <CorrectionBubble
              correction={group.correction}
              onRemove={onRemoveCorrection}
            />
          </span>
        ) : (
          group.chars.map((ann) => (
            <AnnotatedChar
              key={ann.offset}
              ann={ann}
              fontSize={fontSize}
              dataOffset={ann.offset}
            />
          ))
        ),
      )}
    </div>
  );
}
