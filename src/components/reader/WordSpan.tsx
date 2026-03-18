"use client";

import React, { useMemo } from "react";
import { applyThirdToneSandhi } from "@/lib/tone-sandhi";
import { pinyin } from "pinyin-pro";
import ToJyutping from "to-jyutping";

// Keep AnnotationMode export for Listening tab backward compatibility
export type AnnotationMode = "pinyin" | "jyutping" | "plain";

export interface WordSpanProps {
  text: string;
  index: number;
  isWordLike: boolean;
  showPinyin?: boolean;
  showJyutping?: boolean;
  showEnglish?: boolean;
  englishGloss?: string;
  /** Main font size in px — annotations scale proportionally */
  fontSize?: number;
  /** Legacy prop (Listening tab) — overrides booleans if set */
  annotationMode?: AnnotationMode;
  showSandhi?: boolean;
}

function getPinyinArray(text: string): string[] {
  return applyThirdToneSandhi(text);
}

function getJyutpingArray(text: string): (string | null)[] {
  return ToJyutping.getJyutpingList(text).map(([, jp]) => jp);
}

function buildPinyinRuby(
  text: string,
  showSandhi: boolean,
): React.ReactElement[] {
  const chars = [...text];
  if (showSandhi) {
    const syllables = applyThirdToneSandhi(text);
    return chars.map((char, i) => (
      <ruby key={i}>
        <span>{char}</span>
        <rp>(</rp>
        <rt className="text-center text-[0.75em] text-muted-foreground">
          {syllables[i] ?? ""}
        </rt>
        <rp>)</rp>
      </ruby>
    ));
  }
  const syllables = pinyin(text, { type: "array" });
  return chars.map((char, i) => (
    <ruby key={i}>
      <span>{char}</span>
      <rp>(</rp>
      <rt className="text-center text-[0.75em] text-muted-foreground">
        {syllables[i] ?? ""}
      </rt>
      <rp>)</rp>
    </ruby>
  ));
}

function buildJyutpingRuby(text: string): React.ReactElement[] {
  const jpList = ToJyutping.getJyutpingList(text);
  return jpList.map(([char, jp], i) => {
    if (jp) {
      return (
        <ruby key={i}>
          <span>{char}</span>
          <rp>(</rp>
          <rt className="text-center text-[0.75em] text-muted-foreground">{jp}</rt>
          <rp>)</rp>
        </ruby>
      );
    }
    return <span key={i}>{char}</span>;
  });
}

const WORD_CLASS =
  "cursor-pointer rounded px-0.5 transition-colors hover:bg-cyan-500/20";

export const WordSpan = React.memo(function WordSpan({
  text,
  index,
  isWordLike,
  showPinyin: showPinyinProp,
  showJyutping: showJyutpingProp,
  showEnglish: showEnglishProp,
  englishGloss,
  fontSize = 18,
  annotationMode,
  showSandhi = true,
}: WordSpanProps) {
  // Resolve props: legacy annotationMode overrides booleans
  const isLegacy = !!annotationMode;
  const showPinyin = isLegacy
    ? annotationMode === "pinyin"
    : (showPinyinProp ?? false);
  const showJyutping = isLegacy
    ? annotationMode === "jyutping"
    : (showJyutpingProp ?? false);
  const showEnglish = isLegacy ? false : ((showEnglishProp ?? false) && !!englishGloss);

  // Annotation sizing: pinyin/jyutping are 1.2x the base character size
  const annotationSize = Math.round(fontSize * 1.2);
  const englishSize = Math.round(fontSize * 1.1);

  // All hooks called unconditionally
  const legacyContent = useMemo(() => {
    if (!isLegacy || !isWordLike) return null;
    if (annotationMode === "pinyin") return buildPinyinRuby(text, showSandhi);
    if (annotationMode === "jyutping") return buildJyutpingRuby(text);
    return text;
  }, [text, annotationMode, showSandhi, isLegacy, isWordLike]);

  const pinyinArr = useMemo(
    () => (!isLegacy && showPinyin && isWordLike ? getPinyinArray(text) : []),
    [text, showPinyin, isLegacy, isWordLike],
  );

  const jyutpingArr = useMemo(
    () => (!isLegacy && showJyutping && isWordLike ? getJyutpingArray(text) : []),
    [text, showJyutping, isLegacy, isWordLike],
  );

  if (!isWordLike) {
    if (text === "\n") return <br />;
    return <span>{text}</span>;
  }

  // Legacy ruby mode (Listening tab)
  if (isLegacy) {
    return (
      <span data-word={text} data-index={index} className={WORD_CLASS}>
        {legacyContent}
      </span>
    );
  }

  // Stacked mode (Reader) — table-like: each word is a column
  // Rows: pinyin | characters | jyutping | english
  const hasAnnotation = showPinyin || showJyutping;

  if (hasAnnotation || showEnglish) {
    const chars = [...text];
    return (
      <span
        data-word={text}
        data-index={index}
        className={`${WORD_CLASS} inline-flex flex-col items-center`}
      >
        {/* Per-character columns with annotations stacked above */}
        <span className="inline-flex items-end">
          {chars.map((char, i) => (
            <span key={i} className="inline-flex flex-col items-center" style={{ minWidth: "1.1em" }}>
              {showPinyin && (
                <span
                  className="text-center text-blue-400 leading-tight select-none whitespace-nowrap"
                  style={{ fontSize: `${annotationSize}px` }}
                >
                  {pinyinArr[i] ?? "\u00A0"}
                </span>
              )}
              {showJyutping && (
                <span
                  className="text-center text-orange-400 leading-tight select-none whitespace-nowrap"
                  style={{ fontSize: `${annotationSize}px` }}
                >
                  {jyutpingArr[i] ?? "\u00A0"}
                </span>
              )}
              <span className="text-center">{char}</span>
            </span>
          ))}
        </span>
        {/* English gloss (spans full word width) */}
        {showEnglish && (
          <span
            className="text-center text-emerald-400/80 leading-tight select-none whitespace-nowrap"
            style={{ fontSize: `${englishSize}px` }}
          >
            {englishGloss}
          </span>
        )}
      </span>
    );
  }

  return (
    <span data-word={text} data-index={index} className={WORD_CLASS}>
      {text}
    </span>
  );
});
