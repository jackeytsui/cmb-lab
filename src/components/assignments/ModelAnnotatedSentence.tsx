"use client";

import { AnnotatedChar } from "@/components/assignments/AnnotatedChar";
import {
  annotateFromModelAnswer,
  ASSIGNMENT_CHAR_SIZE,
  ASSIGNMENT_ENGLISH_SIZE,
} from "@/lib/mandarin-annotate";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Mandarin sentence rendered from an EXPLICIT stored pinyin string (admin- or
// reviewer-approved): per-character pinyin stacked on top with tone colors,
// optional English translation beneath — the standard assignment display.
// Use this when the pinyin was generated-then-edited and must match what was
// stored, rather than re-deriving it from the characters at render time.
// ---------------------------------------------------------------------------

export function ModelAnnotatedSentence({
  chinese,
  pinyin,
  english,
  fontSize = ASSIGNMENT_CHAR_SIZE,
  className,
}: {
  chinese: string;
  /** Space-separated pinyin, one syllable per Han character. */
  pinyin: string;
  english?: string | null;
  fontSize?: number;
  className?: string;
}) {
  const annotations = annotateFromModelAnswer(chinese, pinyin);
  return (
    <div className={cn("space-y-1.5", className)}>
      <span
        className="inline-flex flex-wrap items-end gap-y-1.5"
        style={{ lineHeight: 1.15 }}
      >
        {annotations.map((ann) => (
          <AnnotatedChar key={ann.offset} ann={ann} fontSize={fontSize} />
        ))}
      </span>
      {english ? (
        <p
          className="text-muted-foreground"
          style={{ fontSize: `${ASSIGNMENT_ENGLISH_SIZE}px` }}
        >
          {english}
        </p>
      ) : null}
    </div>
  );
}
