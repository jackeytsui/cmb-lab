"use client";

import { useMemo } from "react";
import { WordSpan } from "@/components/reader/WordSpan";
import { segmentText } from "@/lib/segmenter";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Read-only Mandarin sentence display matching the 1:1 coaching notes format:
// per-character pinyin stacked on top, larger Chinese characters, and
// tone-colored text. Reuses the exact coaching rendering primitive (WordSpan)
// plus the client segmenter, so pinyin/tone colors are derived identically to
// the coaching page. No TTS/tooltip/translation machinery — this is a pure
// display component.
// ---------------------------------------------------------------------------

export function AnnotatedSentence({
  text,
  fontSize = 24,
  className,
}: {
  text: string;
  /** Base character size in px; pinyin scales proportionally above it. */
  fontSize?: number;
  className?: string;
}) {
  const segments = useMemo(() => segmentText(text), [text]);

  return (
    <span
      className={cn("inline-flex items-end flex-wrap gap-x-0.5 gap-y-1", className)}
      style={{ lineHeight: "1.2" }}
    >
      {segments.map((seg, i) => (
        <WordSpan
          key={i}
          text={seg.text}
          index={i}
          isWordLike={seg.isWordLike}
          showPinyin
          toneColorsEnabled
          fontSize={fontSize}
        />
      ))}
    </span>
  );
}
