"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import {
  extractToneFromJyutping,
  extractToneFromPinyin,
  getToneColorStyle,
} from "@/lib/tone-colors";
import { PINYIN_RATIO, type CharAnnotation } from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// One stacked character column: pinyin on top, character below. Shared by the
// submission card, reviewer view, and feedback page so they render
// identically. The pinyin is a select-none sibling ABOVE the character, so it
// always sits on top of its character and moves with it (including inside
// struck-through corrections). The character span carries `data-offset` for
// the reviewer's highlight-to-select mechanic; its text content is just the
// character so offset math stays correct.
// ---------------------------------------------------------------------------

export function AnnotatedChar({
  ann,
  fontSize,
  struck = false,
  dataOffset,
  lang = "mandarin",
  pronunciationMarked = false,
  pronunciationMarkNumber = 0,
  onPronunciationClick,
}: {
  ann: CharAnnotation;
  fontSize: number;
  /** Render the character as a red strikethrough (corrected original text). */
  struck?: boolean;
  /** UTF-16 offset to expose for selection mapping; omit for read-only views. */
  dataOffset?: number;
  /** Tone-colour system: mandarin (4 tones) or cantonese (6, jyutping). */
  lang?: "mandarin" | "cantonese";
  /** Highlight this unit as an existing reviewer pronunciation marker. */
  pronunciationMarked?: boolean;
  /** Marker number shown beside the matching Chinese character. */
  pronunciationMarkNumber?: number;
  /** Enables Pinyin/Jyutping selection and opens the pronunciation editor. */
  onPronunciationClick?: () => void;
}) {
  const pinyinSize = Math.round(fontSize * PINYIN_RATIO);
  const tone = ann.pinyin
    ? lang === "cantonese"
      ? extractToneFromJyutping(ann.pinyin)
      : extractToneFromPinyin(ann.pinyin)
    : 0;
  const toneStyle = ann.pinyin ? getToneColorStyle(tone, lang) : undefined;

  const charStyle: CSSProperties = struck
    ? { fontSize: `${fontSize}px`, color: "#ef4444" }
    : { fontSize: `${fontSize}px`, ...toneStyle };

  return (
    <span
      className="inline-flex flex-col items-center align-top"
      style={{ minWidth: "1.05em" }}
      data-pronunciation-unit={onPronunciationClick ? true : undefined}
    >
      <span
        data-pronunciation-kind={
          onPronunciationClick ? "romanization" : undefined
        }
        data-pronunciation-offset={
          onPronunciationClick ? ann.offset : undefined
        }
        data-pronunciation-end={
          onPronunciationClick ? ann.offset + ann.char.length : undefined
        }
        onClick={
          onPronunciationClick
            ? (event) => {
                event.stopPropagation();
                onPronunciationClick();
              }
            : undefined
        }
        className={cn(
          "whitespace-nowrap leading-tight text-blue-400",
          onPronunciationClick
            ? "cursor-pointer rounded-sm hover:bg-amber-500/10"
            : "select-none",
          pronunciationMarked &&
            "underline decoration-amber-500 decoration-wavy decoration-2 underline-offset-4",
        )}
        style={{ fontSize: `${pinyinSize}px` }}
      >
        {ann.pinyin || " "}
      </span>
      <span
        data-offset={dataOffset}
        data-pronunciation-kind={
          onPronunciationClick ? "chinese" : undefined
        }
        data-pronunciation-offset={
          onPronunciationClick ? ann.offset : undefined
        }
        data-pronunciation-end={
          onPronunciationClick ? ann.offset + ann.char.length : undefined
        }
        onClick={
          pronunciationMarked && onPronunciationClick
            ? (event) => {
                event.stopPropagation();
                onPronunciationClick();
              }
            : undefined
        }
        className={cn(
          "relative leading-tight",
          struck && "line-through decoration-red-500 decoration-2",
          pronunciationMarked &&
            "cursor-pointer rounded-sm underline decoration-amber-500 decoration-wavy decoration-2 underline-offset-4 hover:bg-amber-500/10",
        )}
        style={charStyle}
      >
        {ann.char}
        {pronunciationMarkNumber > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 select-none items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
            {pronunciationMarkNumber}
          </span>
        ) : null}
      </span>
    </span>
  );
}
