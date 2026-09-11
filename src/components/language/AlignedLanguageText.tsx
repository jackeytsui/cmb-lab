"use client";

import { useRef, useState } from "react";
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

type RowSelection = {
  language: SelectableLanguage;
  startIndex: number;
  endIndex: number;
};

type DragSelection = {
  language: SelectableLanguage;
  anchorIndex: number;
  lineTop: number;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

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
  selected,
  className,
}: {
  kind: "pinyin" | "jyutping";
  value: string;
  index: number;
  word: CharacterWord | undefined;
  fontSize: number;
  toneColors: boolean;
  selected: boolean;
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
        "select-none whitespace-nowrap rounded-sm px-[0.08em] text-center leading-tight",
        kind === "pinyin" ? "text-blue-400" : "text-orange-400",
        selected && "bg-sky-200/80 dark:bg-sky-700/70",
        toneClass,
        className,
      )}
      data-aligned-selected={selected ? true : undefined}
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
 * unit. Pointer-drag selection is drawn only on the chosen language row, and
 * copied Pinyin/Jyutping and Chinese remain separate and clean.
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
  const [rowSelection, setRowSelection] = useState<RowSelection | null>(null);
  const rowSelectionRef = useRef<RowSelection | null>(null);
  const dragSelectionRef = useRef<DragSelection | null>(null);
  const copyBufferRef = useRef<HTMLTextAreaElement | null>(null);
  const suppressClickRef = useRef(false);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) return;
    const cell = (event.target as Element).closest<HTMLElement>(
      LANGUAGE_CELL_SELECTOR,
    );
    const language = cell?.dataset.alignedLanguageCell as
      | SelectableLanguage
      | undefined;
    const index = Number(cell?.dataset.alignedLanguageIndex);
    const unit = cell?.closest<HTMLElement>("[data-aligned-unit]");
    if (!language || !Number.isInteger(index) || !unit) {
      rowSelectionRef.current = null;
      setRowSelection(null);
      return;
    }

    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    rowSelectionRef.current = null;
    setRowSelection(null);
    dragSelectionRef.current = {
      language,
      anchorIndex: index,
      lineTop: unit.offsetTop,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragSelectionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3
    ) {
      return;
    }

    drag.moved = true;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const eventTarget = event.target as Element;
    const pointedElement =
      eventTarget.closest(LANGUAGE_CELL_SELECTOR) ??
      document.elementFromPoint?.(event.clientX, event.clientY);
    const cell = pointedElement?.closest<HTMLElement>(LANGUAGE_CELL_SELECTOR);
    const unit = cell?.closest<HTMLElement>("[data-aligned-unit]");
    const language = cell?.dataset.alignedLanguageCell;
    const index = Number(cell?.dataset.alignedLanguageIndex);
    if (
      language !== drag.language ||
      !Number.isInteger(index) ||
      !unit ||
      Math.abs(unit.offsetTop - drag.lineTop) > 2
    ) {
      return;
    }

    const nextSelection = {
      language: drag.language,
      startIndex: Math.min(drag.anchorIndex, index),
      endIndex: Math.max(drag.anchorIndex, index),
    };
    rowSelectionRef.current = nextSelection;
    setRowSelection(nextSelection);
  };

  const textForSelection = (selection: RowSelection): string =>
    selection.language === "chinese"
      ? chars.slice(selection.startIndex, selection.endIndex + 1).join("")
      : (selection.language === "pinyin"
          ? pinyinAnnotations
          : jyutpingAnnotations)
          .slice(selection.startIndex, selection.endIndex + 1)
          .map((annotation) => annotation.pinyin)
          .filter(Boolean)
          .join(" ");

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragSelectionRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragSelectionRef.current = null;
    if (!drag.moved || !rowSelectionRef.current) return;

    event.preventDefault();
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.getSelection()?.removeAllRanges();
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
    window.requestAnimationFrame(() => {
      const buffer = copyBufferRef.current;
      const selection = rowSelectionRef.current;
      if (!buffer || !selection) return;
      buffer.value = textForSelection(selection);
      buffer.focus({ preventScroll: true });
      buffer.select();
    });
  };

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const activeRowSelection = rowSelectionRef.current;
    if (activeRowSelection) {
      event.preventDefault();
      event.clipboardData.setData(
        "text/plain",
        textForSelection(activeRowSelection),
      );
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    const startCell = closestLanguageCell(range.startContainer);
    const endCell = closestLanguageCell(range.endContainer);
    const endpointLanguage = startCell?.dataset.alignedLanguageCell as
      | SelectableLanguage
      | undefined;
    const language = endpointLanguage;
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
      className={cn("min-w-0", className)}
      onCopy={handleCopy}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancel={() => {
        dragSelectionRef.current = null;
      }}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
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
          const isSelected = (language: SelectableLanguage) =>
            rowSelection?.language === language &&
            index >= rowSelection.startIndex &&
            index <= rowSelection.endIndex;

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
                  selected={isSelected("pinyin")}
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
                  selected={isSelected("jyutping")}
                  className={jyutpingClassName}
                />
              ) : null}
              <span
                data-aligned-language-cell="chinese"
                data-aligned-language-index={index}
                data-word={word?.word}
                data-index={word?.wordIndex}
                className={cn(
                  "select-none whitespace-pre rounded-sm text-center leading-tight",
                  isSelected("chinese") &&
                    "bg-sky-200/80 dark:bg-sky-700/70",
                  word?.word &&
                    "cursor-pointer rounded transition-colors hover:bg-cyan-500/20",
                  word?.word &&
                    highlightedWords?.has(word.word) &&
                    "rounded-sm border-b border-emerald-500/30 bg-emerald-500/10",
                  toneClass,
                  chineseClassName,
                )}
                data-aligned-selected={
                  isSelected("chinese") ? true : undefined
                }
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
      <textarea
        ref={copyBufferRef}
        tabIndex={-1}
        readOnly
        aria-label="Selected language text"
        className="fixed -left-[9999px] top-0 h-px w-px opacity-0"
        onBlur={() => {
          rowSelectionRef.current = null;
          setRowSelection(null);
        }}
      />
    </div>
  );
}
