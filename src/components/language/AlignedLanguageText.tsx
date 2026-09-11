"use client";

import { useState } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  PointerEvent as ReactPointerEvent,
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

type SelectableLanguage = "pinyin" | "jyutping" | "chinese";

const LANGUAGE_CELL_SELECTOR = "[data-aligned-language-cell]";

function closestLanguageCell(node: Node): HTMLElement | null {
  const element =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement;
  return element?.closest<HTMLElement>(LANGUAGE_CELL_SELECTOR) ?? null;
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

function RomanizationCell({
  kind,
  value,
  index,
  word,
  fontSize,
  toneColors,
  selectingLanguage,
  className,
}: {
  kind: "pinyin" | "jyutping";
  value: string;
  index: number;
  word: CharacterWord | undefined;
  fontSize: number;
  toneColors: boolean;
  selectingLanguage: SelectableLanguage | null;
  className?: string;
}) {
  const tone =
    kind === "pinyin"
      ? extractToneFromPinyin(value)
      : extractToneFromJyutping(value);
  const toneClass = toneColors
    ? getToneColorClass(tone, kind === "pinyin" ? "mandarin" : "cantonese")
    : "";

  return (
    <span
      data-aligned-language-cell={kind}
      data-aligned-language-index={index}
      data-annotation={kind}
      data-word={word?.word}
      data-index={word?.wordIndex}
      className={cn(
        "whitespace-nowrap px-[0.08em] text-center leading-tight",
        kind === "pinyin" ? "text-blue-400" : "text-orange-400",
        selectingLanguage !== null &&
          selectingLanguage !== kind &&
          "select-none selection:bg-transparent selection:text-inherit",
        toneClass,
        className,
      )}
      style={{ fontSize: `${fontSize}px` }}
    >
      {value || "\u00a0"}
    </span>
  );
}

/**
 * Site-wide Chinese display primitive.
 *
 * Each character and its romanization form one naturally wrapping visual
 * unit. The inactive language rows are excluded during selection, so copied
 * Pinyin/Jyutping and Chinese remain separate and clean.
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
  const pinyinAnnotations = annotateFromModelAnswer(chinese, pinyinValue);
  const jyutpingAnnotations = annotateFromModelAnswer(chinese, jyutpingValue);
  const characterWords = buildCharacterWords(segments, segmentStartIndex);
  const [selectingLanguage, setSelectingLanguage] =
    useState<SelectableLanguage | null>(null);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const cell = (event.target as Element).closest<HTMLElement>(
      LANGUAGE_CELL_SELECTOR,
    );
    const language = cell?.dataset.alignedLanguageCell as
      | SelectableLanguage
      | undefined;
    if (language) setSelectingLanguage(language);
  };

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const startCell = closestLanguageCell(range.startContainer);
    const endCell = closestLanguageCell(range.endContainer);
    const endpointLanguage = startCell?.dataset.alignedLanguageCell as
      | SelectableLanguage
      | undefined;
    const language = selectingLanguage ?? endpointLanguage;
    if (!language) return;

    const selectedIndices = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>(
        `[data-aligned-language-cell="${language}"]`,
      ),
    )
      .filter((cell) => range.intersectsNode(cell))
      .map((cell) => Number(cell.dataset.alignedLanguageIndex))
      .filter(Number.isInteger);
    if (selectedIndices.length === 0) {
      if (
        !startCell ||
        !endCell ||
        endpointLanguage !== endCell.dataset.alignedLanguageCell
      ) {
        return;
      }
      selectedIndices.push(
        Number(startCell.dataset.alignedLanguageIndex),
        Number(endCell.dataset.alignedLanguageIndex),
      );
    }

    const first = Math.min(...selectedIndices);
    const last = Math.max(...selectedIndices);
    const copiedText =
      language === "chinese"
        ? chars.slice(first, last + 1).join("")
        : (language === "pinyin" ? pinyinAnnotations : jyutpingAnnotations)
            .slice(first, last + 1)
            .map((annotation) => annotation.pinyin)
            .filter(Boolean)
            .join(" ");

    event.preventDefault();
    event.clipboardData.setData("text/plain", copiedText);
  };

  return (
    <div
      className={cn("min-w-0 select-text", className)}
      onCopy={handleCopy}
      onPointerDownCapture={handlePointerDown}
    >
      <div
        className={cn(
          "flex max-w-full flex-wrap items-end gap-x-1 gap-y-1.5",
          contentClassName,
          gridClassName,
        )}
        data-aligned-wrapped-content
        style={{ lineHeight: 1.15 }}
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
              className="inline-flex min-w-[1.05em] flex-col items-center align-top"
              data-aligned-unit
            >
              {showPinyin && pinyinValue ? (
                <RomanizationCell
                  kind="pinyin"
                  value={pinyinAnnotations[index]?.pinyin ?? ""}
                  index={index}
                  word={word}
                  fontSize={annotationSize}
                  toneColors={romanizationToneColors}
                  selectingLanguage={selectingLanguage}
                  className={pinyinClassName}
                />
              ) : null}
              {showJyutping && jyutpingValue ? (
                <RomanizationCell
                  kind="jyutping"
                  value={jyutpingAnnotations[index]?.pinyin ?? ""}
                  index={index}
                  word={word}
                  fontSize={annotationSize}
                  toneColors={romanizationToneColors}
                  selectingLanguage={selectingLanguage}
                  className={jyutpingClassName}
                />
              ) : null}
              <span
                data-aligned-language-cell="chinese"
                data-aligned-language-index={index}
                data-word={word?.word}
                data-index={word?.wordIndex}
                className={cn(
                  "whitespace-pre text-center leading-tight",
                  selectingLanguage !== null &&
                    selectingLanguage !== "chinese" &&
                    "select-none selection:bg-transparent selection:text-inherit",
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
            </span>
          );
        })}
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
