"use client";

import type { ReactNode } from "react";
import { AlignedLanguageText } from "@/components/language/AlignedLanguageText";
import type { WordSegment } from "@/lib/segmenter";

type ReaderTextRowsProps = {
  segments: WordSegment[];
  text: string;
  pinyin?: string;
  jyutping?: string;
  showPinyin: boolean;
  showJyutping: boolean;
  fontSize: number;
  toneColorsEnabled: boolean;
  toneLanguage: "mandarin" | "cantonese";
  startIndex?: number;
  englishGlosses?: readonly (string | undefined)[];
  trailingControls?: ReactNode;
};

/** Adapts reader sentence data to the site-wide aligned language display. */
export function ReaderTextRows({
  segments,
  text,
  pinyin,
  jyutping,
  showPinyin,
  showJyutping,
  fontSize,
  toneColorsEnabled,
  toneLanguage,
  startIndex = 0,
  englishGlosses,
  trailingControls,
}: ReaderTextRowsProps) {
  const english = englishGlosses?.filter(Boolean).join(" ");

  return (
    <AlignedLanguageText
      chinese={text}
      pinyin={pinyin}
      jyutping={jyutping}
      english={english}
      showPinyin={showPinyin}
      showJyutping={showJyutping}
      fontSize={fontSize}
      annotationSize={Math.round(fontSize * 1.2)}
      englishSize={Math.round(fontSize * 1.1)}
      toneColorsEnabled={toneColorsEnabled}
      toneLanguage={toneLanguage}
      segments={segments}
      segmentStartIndex={startIndex}
      trailingControls={trailingControls}
      englishClassName="leading-tight text-emerald-400/80"
    />
  );
}
