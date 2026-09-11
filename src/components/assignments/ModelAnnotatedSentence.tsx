"use client";

import { AlignedLanguageText } from "@/components/language/AlignedLanguageText";
import {
  ASSIGNMENT_CHAR_SIZE,
  ASSIGNMENT_ENGLISH_SIZE,
  PINYIN_RATIO,
} from "@/lib/mandarin-annotate";

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
  englishSize = ASSIGNMENT_ENGLISH_SIZE,
  className,
  lang = "mandarin",
}: {
  chinese: string;
  /** Space-separated romanisation (pinyin or jyutping), one syllable per Han char. */
  pinyin: string;
  english?: string | null;
  fontSize?: number;
  englishSize?: number;
  className?: string;
  /** Romanisation/tone-colour system for the characters. */
  lang?: "mandarin" | "cantonese";
}) {
  return (
    <AlignedLanguageText
      chinese={chinese}
      pinyin={lang === "mandarin" ? pinyin : undefined}
      jyutping={lang === "cantonese" ? pinyin : undefined}
      english={english}
      showPinyin={lang === "mandarin"}
      showJyutping={lang === "cantonese"}
      fontSize={fontSize}
      annotationSize={Math.round(fontSize * PINYIN_RATIO)}
      englishSize={englishSize}
      toneColorsEnabled
      toneLanguage={lang}
      className={className}
    />
  );
}
