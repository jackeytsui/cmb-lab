"use client";

import { useMemo } from "react";
import { AnnotatedChar } from "@/components/assignments/AnnotatedChar";
import { annotateSentence, ASSIGNMENT_CHAR_SIZE } from "@/lib/mandarin-annotate";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Read-only Mandarin sentence display in the 1:1 coaching notes style:
// per-character pinyin stacked on top, tone-colored characters. Renders each
// character via the shared AnnotatedChar column so the submission card,
// reviewer view, and feedback page all look identical.
// ---------------------------------------------------------------------------

export function AnnotatedSentence({
  text,
  fontSize = ASSIGNMENT_CHAR_SIZE,
  className,
}: {
  text: string;
  /** Chinese character size in px; pinyin is rendered at ~half this. */
  fontSize?: number;
  className?: string;
}) {
  const annotations = useMemo(() => annotateSentence(text), [text]);

  return (
    <span
      className={cn("inline-flex flex-wrap items-end gap-y-1.5", className)}
      style={{ lineHeight: 1.15 }}
    >
      {annotations.map((ann) => (
        <AnnotatedChar key={ann.offset} ann={ann} fontSize={fontSize} />
      ))}
    </span>
  );
}
