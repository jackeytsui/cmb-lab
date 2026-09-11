"use client";

import { AlignedLanguageText } from "@/components/language/AlignedLanguageText";
import { useSentenceAnnotations } from "@/components/assignments/useSentenceAnnotations";
import {
  ASSIGNMENT_CHAR_SIZE,
  ASSIGNMENT_ENGLISH_SIZE,
  PINYIN_RATIO,
} from "@/lib/mandarin-annotate";

// ---------------------------------------------------------------------------
// Read-only Mandarin sentence display in the 1:1 coaching notes style:
// per-character pinyin stacked on top, tone-colored characters. Renders each
// character via the shared AnnotatedChar column so the submission card,
// reviewer view, and feedback page all look identical.
// ---------------------------------------------------------------------------

export function AnnotatedSentence({
  text,
  english,
  fontSize = ASSIGNMENT_CHAR_SIZE,
  englishSize = ASSIGNMENT_ENGLISH_SIZE,
  className,
}: {
  text: string;
  english?: string | null;
  /** Chinese character size in px; pinyin is rendered at ~half this. */
  fontSize?: number;
  englishSize?: number;
  className?: string;
}) {
  const annotations = useSentenceAnnotations(text);
  const pinyin = annotations
    .map((annotation) => annotation.pinyin)
    .filter(Boolean)
    .join(" ");

  return (
    <AlignedLanguageText
      chinese={text}
      pinyin={pinyin}
      english={english}
      fontSize={fontSize}
      annotationSize={Math.round(fontSize * PINYIN_RATIO)}
      englishSize={englishSize}
      toneColorsEnabled
      className={className}
    />
  );
}
