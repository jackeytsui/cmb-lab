"use client";

import type {
  ClipboardEvent as ReactClipboardEvent,
  CSSProperties,
  ReactNode,
} from "react";
import { annotateFromModelAnswer } from "@/lib/mandarin-annotate";
import type { WordSegment } from "@/lib/segmenter";
import {
  extractToneFromJyutping,
  extractToneFromPinyin,
  getToneColorClass,
  getToneColorStyle,
  getToneDataAttr,
} from "@/lib/tone-colors";
import { cn } from "@/lib/utils";

type CharacterWord = {
  word?: string;
  wordIndex?: number;
};

const LANGUAGE_ROW_SELECTOR = [
  "[data-aligned-romanization-row]",
  "[data-aligned-chinese-row]",
  "[data-aligned-english-row]",
].join(",");

function closestLanguageRow(node: Node): Element | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest(LANGUAGE_ROW_SELECTOR) ?? null;
}

function normaliseCopiedRow(text: string, row: Element): string {
  if (row.hasAttribute("data-aligned-chinese-row")) {
    return text.replace(/[\r\n]+/g, "");
  }
  if (row.hasAttribute("data-aligned-romanization-row")) {
    return text
      .replace(/\s*(?:\r\n|\r|\n)\s*/g, " ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
  return text;
}

export type AlignedLanguageTextProps = {
  chinese: string;
  pinyin?: string | null;
  jyutping?: string | null;
  english?: string | null;
  showPinyin?: boolean;
  showJyutping?: boolean;
  fontSize?: number;
  annotationSize?: number;
  englishSize?: number;
  toneColorsEnabled?: boolean;
  romanizationToneColors?: boolean;
  toneLanguage?: "mandarin" | "cantonese";
  segments?: readonly WordSegment[];
  segmentStartIndex?: number;
  trailingControls?: ReactNode;
  className?: string;
  contentClassName?: string;
  gridClassName?: string;
  chineseClassName?: string;
  pinyinClassName?: string;
  jyutpingClassName?: string;
  englishClassName?: string;
  highlightedWords?: ReadonlySet<string>;
};

function buildCharacterWords(
  segments: readonly WordSegment[] | undefined,
  startIndex: number,
): CharacterWord[] {
  if (!segments) return [];

  return segments.flatMap((segment, segmentIndex) =>
    [...segment.text].map(() =>
      segment.isWordLike
        ? { word: segment.text, wordIndex: startIndex + segmentIndex }
        : {},
    ),
  );
}

function RomanizationCells({
  chinese,
  romanization,
  kind,
  className,
  fontSize,
  characterWords,
  toneColors,
}: {
  chinese: string;
  romanization: string;
  kind: "pinyin" | "jyutping";
  className?: string;
  fontSize: number;
  characterWords: readonly CharacterWord[];
  toneColors: boolean;
}) {
  const annotations = annotateFromModelAnswer(chinese, romanization);
  const lastSyllableIndex = annotations.reduce(
    (lastIndex, annotation, index) =>
      annotation.pinyin ? index : lastIndex,
    -1,
  );

  return (
    <div
      className="contents"
      data-aligned-romanization-row={kind}
      aria-label={kind === "pinyin" ? "Pinyin" : "Jyutping"}
    >
      {annotations.map((annotation, index) => {
        const tone =
          kind === "pinyin"
            ? extractToneFromPinyin(annotation.pinyin)
            : extractToneFromJyutping(annotation.pinyin);
        const toneClass = toneColors
          ? getToneColorClass(
              tone,
              kind === "pinyin" ? "mandarin" : "cantonese",
            )
          : "";

        return (
          <span
            key={annotation.offset}
            data-annotation={kind}
            data-word={characterWords[index]?.word}
            data-index={characterWords[index]?.wordIndex}
            className={cn(
              "min-w-[1.05em] whitespace-nowrap px-[0.08em] text-center leading-tight",
              kind === "pinyin" ? "text-blue-400" : "text-orange-400",
              toneClass,
              className,
            )}
            style={{ fontSize: `${fontSize}px` }}
          >
            {annotation.pinyin}
            {annotation.pinyin && index < lastSyllableIndex ? (
              <span className="sr-only"> </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Site-wide Chinese display primitive.
 *
 * Romanization and Hanzi are separate DOM rows for clean selection, while a
 * shared CSS grid column keeps every syllable directly above its character.
 */
export function AlignedLanguageText({
  chinese,
  pinyin = "",
  jyutping = "",
  english,
  showPinyin = Boolean(pinyin),
  showJyutping = Boolean(jyutping),
  fontSize = 18,
  annotationSize = Math.round(fontSize * 0.7),
  englishSize = Math.round(fontSize * 0.8),
  toneColorsEnabled = false,
  romanizationToneColors = false,
  toneLanguage = showJyutping && !showPinyin ? "cantonese" : "mandarin",
  segments,
  segmentStartIndex = 0,
  trailingControls,
  className,
  contentClassName,
  gridClassName,
  chineseClassName,
  pinyinClassName,
  jyutpingClassName,
  englishClassName,
  highlightedWords,
}: AlignedLanguageTextProps) {
  const chars = [...chinese];
  const pinyinValue = pinyin?.trim() ?? "";
  const jyutpingValue = jyutping?.trim() ?? "";
  const toneRomanization =
    toneLanguage === "cantonese" ? jyutpingValue : pinyinValue;
  const toneAnnotations = annotateFromModelAnswer(chinese, toneRomanization);
  const characterWords = buildCharacterWords(segments, segmentStartIndex);
  const gridStyle: CSSProperties = {
    gridTemplateColumns: `repeat(${Math.max(chars.length, 1)}, max-content)`,
  };

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const startRow = closestLanguageRow(range.startContainer);
    const endRow = closestLanguageRow(range.endContainer);
    if (!startRow || startRow !== endRow) return;

    const copiedText = selection.toString();
    const normalisedText = normaliseCopiedRow(copiedText, startRow);
    if (normalisedText === copiedText) return;

    event.preventDefault();
    event.clipboardData.setData("text/plain", normalisedText);
  };

  return (
    <div className={cn("min-w-0 select-text", className)} onCopy={handleCopy}>
      <div
        className={cn(
          "flex max-w-full items-end gap-1 overflow-x-auto",
          contentClassName,
        )}
      >
        <div
          className={cn("inline-grid min-w-max items-end", gridClassName)}
          style={gridStyle}
        >
          {showPinyin && pinyinValue ? (
            <RomanizationCells
              chinese={chinese}
              romanization={pinyinValue}
              kind="pinyin"
              className={pinyinClassName}
              fontSize={annotationSize}
              characterWords={characterWords}
              toneColors={romanizationToneColors}
            />
          ) : null}
          {showJyutping && jyutpingValue ? (
            <RomanizationCells
              chinese={chinese}
              romanization={jyutpingValue}
              kind="jyutping"
              className={jyutpingClassName}
              fontSize={annotationSize}
              characterWords={characterWords}
              toneColors={romanizationToneColors}
            />
          ) : null}

          <div
            className="contents"
            data-aligned-chinese-row
            aria-label="Chinese characters"
          >
            {chars.map((char, index) => {
              const syllable = toneAnnotations[index]?.pinyin ?? "";
              const tone =
                toneLanguage === "cantonese"
                  ? extractToneFromJyutping(syllable)
                  : extractToneFromPinyin(syllable);
              const toneClass = toneColorsEnabled
                ? getToneColorClass(tone, toneLanguage)
                : "";
              const toneStyle = toneColorsEnabled
                ? getToneColorStyle(tone, toneLanguage)
                : undefined;
              const toneData = toneColorsEnabled
                ? getToneDataAttr(tone, toneLanguage)
                : "";
              const word = characterWords[index];

              return (
                <span
                  key={`${char}-${index}`}
                  data-word={word?.word}
                  data-index={word?.wordIndex}
                  className={cn(
                    "min-w-[1.05em] whitespace-pre text-center leading-tight",
                    word?.word &&
                      "cursor-pointer rounded transition-colors hover:bg-cyan-500/20",
                    word?.word &&
                      highlightedWords?.has(word.word) &&
                      "rounded-sm border-b border-emerald-500/30 bg-emerald-500/10",
                    toneClass,
                    chineseClassName,
                  )}
                  style={{ fontSize: `${fontSize}px`, ...toneStyle }}
                  {...(toneData ? { "data-tc": toneData } : {})}
                >
                  {char}
                </span>
              );
            })}
          </div>
        </div>
        {trailingControls}
      </div>

      {english ? (
        <div
          data-aligned-english-row
          aria-label="English translation"
          className={cn("mt-1 text-muted-foreground", englishClassName)}
          style={{ fontSize: `${englishSize}px` }}
        >
          {english}
        </div>
      ) : null}
    </div>
  );
}
