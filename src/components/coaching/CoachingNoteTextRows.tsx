"use client";

import { ReaderTextRows } from "@/components/reader/ReaderTextRows";
import type { WordSegment } from "@/lib/segmenter";

type CoachingNoteTextRowsProps = {
  segments: WordSegment[];
  text: string;
  romanization: string;
  language: "mandarin" | "cantonese";
  showRomanization: boolean;
  fontSize: number;
  toneColorsEnabled: boolean;
};

/** Adapts saved coaching-note data to the shared selectable reader rows. */
export function CoachingNoteTextRows({
  segments,
  text,
  romanization,
  language,
  showRomanization,
  fontSize,
  toneColorsEnabled,
}: CoachingNoteTextRowsProps) {
  const isCantonese = language === "cantonese";

  return (
    <ReaderTextRows
      segments={segments}
      text={text}
      pinyin={isCantonese ? undefined : romanization}
      jyutping={isCantonese ? romanization : undefined}
      showPinyin={showRomanization && !isCantonese}
      showJyutping={showRomanization && isCantonese}
      fontSize={fontSize}
      toneColorsEnabled={toneColorsEnabled}
      toneLanguage={language}
    />
  );
}
