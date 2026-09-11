"use client";

import {
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Pause, Play, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  annotateFromModelAnswer,
  ASSIGNMENT_CHAR_SIZE,
  PINYIN_RATIO,
} from "@/lib/mandarin-annotate";
import {
  extractToneFromJyutping,
  extractToneFromPinyin,
  getToneColorStyle,
} from "@/lib/tone-colors";
import {
  PRONUNCIATION_ISSUE_LABELS,
  PRONUNCIATION_ISSUE_TYPES,
  type PronunciationMarkDto,
} from "@/lib/assignment-pronunciation";

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

type SelectedOffsets =
  | { kind: "range"; start: number; end: number }
  | { kind: "cross-line" };

function selectedOffsets(container: HTMLElement): SelectedOffsets | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }

  const cellFor = (node: Node) =>
    (node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement
    )?.closest<HTMLElement>("[data-pronunciation-offset]") ?? null;
  const startCell = cellFor(range.startContainer);
  const endCell = cellFor(range.endContainer);
  if (!startCell || !endCell) return null;

  const startKind = startCell.dataset.pronunciationKind;
  const endKind = endCell.dataset.pronunciationKind;
  if (!startKind || startKind !== endKind) return null;

  const startUnit = startCell.closest<HTMLElement>("[data-pronunciation-unit]");
  const endUnit = endCell.closest<HTMLElement>("[data-pronunciation-unit]");
  if (!startUnit || !endUnit) return null;
  if (Math.abs(startUnit.offsetTop - endUnit.offsetTop) > 2) {
    return { kind: "cross-line" };
  }

  const start = Number(startCell.dataset.pronunciationOffset);
  const end = Number(endCell.dataset.pronunciationEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  return start <= end
    ? { kind: "range", start, end }
    : { kind: "range", start: end, end: start };
}

function normaliseCopiedRow(
  event: ReactClipboardEvent<HTMLDivElement>,
  chinese: string,
  annotations: ReturnType<typeof annotateFromModelAnswer>,
): void {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  const cellFor = (node: Node) =>
    (node.nodeType === Node.ELEMENT_NODE
      ? (node as Element)
      : node.parentElement
    )?.closest<HTMLElement>("[data-pronunciation-kind]") ?? null;
  const startCell = cellFor(range.startContainer);
  const endCell = cellFor(range.endContainer);
  const kind = startCell?.dataset.pronunciationKind;
  if (!startCell || !endCell || !kind || kind !== endCell.dataset.pronunciationKind) {
    return;
  }
  const start = Number(startCell.dataset.pronunciationOffset);
  const end = Number(endCell.dataset.pronunciationEnd);
  if (!Number.isInteger(start) || !Number.isInteger(end)) return;
  const first = Math.min(start, end);
  const last = Math.max(start, end);
  const copiedText =
    kind === "chinese"
      ? chinese.slice(first, last)
      : annotations
          .filter(
            (annotation) =>
              annotation.offset >= first && annotation.offset < last,
          )
          .map((annotation) => annotation.pinyin)
          .filter(Boolean)
          .join(" ");
  event.preventDefault();
  event.clipboardData.setData("text/plain", copiedText);
}

export function PronunciationMarkedSentence({
  chinese,
  romanization,
  marks,
  lang,
  fontSize = ASSIGNMENT_CHAR_SIZE,
  activeMarkId,
  activeRange,
  onSelectRange,
  onSelectMark,
}: {
  chinese: string;
  romanization: string;
  marks: PronunciationMarkDto[];
  lang: "mandarin" | "cantonese";
  fontSize?: number;
  activeMarkId?: string | null;
  activeRange?: { startOffset: number; endOffset: number } | null;
  onSelectRange?: (startOffset: number, endOffset: number) => void;
  onSelectMark?: (mark: PronunciationMarkDto) => void;
}) {
  const annotations = useMemo(
    () => annotateFromModelAnswer(chinese, romanization),
    [chinese, romanization],
  );
  const ignoreNextClickRef = useRef(false);
  const [selectingKind, setSelectingKind] = useState<
    "romanization" | "chinese" | null
  >(null);

  const marksAt = (offset: number) =>
    marks.filter((mark) => offset >= mark.startOffset && offset < mark.endOffset);
  const markerClass =
    "underline decoration-amber-500 decoration-wavy decoration-2 underline-offset-4";

  const handleCellClick = (
    event: ReactMouseEvent<HTMLElement>,
    offset: number,
    endOffset: number,
  ) => {
    if (!onSelectRange && !onSelectMark) return;
    if (ignoreNextClickRef.current) return;
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) return;
    event.stopPropagation();
    const existing = marksAt(offset)[0];
    if (existing && onSelectMark) onSelectMark(existing);
    else onSelectRange?.(offset, endOffset);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const target = (event.target as Element).closest<HTMLElement>(
      "[data-pronunciation-kind]",
    );
    const kind = target?.dataset.pronunciationKind;
    if (kind === "romanization" || kind === "chinese") {
      setSelectingKind(kind);
    }
  };

  return (
    <div
      className={cn(
        "min-w-0 select-text",
        (onSelectRange || onSelectMark) && "cursor-text",
      )}
      onCopy={(event) => normaliseCopiedRow(event, chinese, annotations)}
      onPointerDownCapture={handlePointerDown}
      onMouseUp={(event) => {
        if (!onSelectRange) return;
        const offsets = selectedOffsets(event.currentTarget);
        if (!offsets) return;
        if (offsets.kind === "cross-line") {
          window.getSelection()?.removeAllRanges();
          toast.error("Select pronunciation within one line.");
          return;
        }
        ignoreNextClickRef.current = true;
        onSelectRange(offsets.start, offsets.end);
        window.getSelection()?.removeAllRanges();
        window.setTimeout(() => {
          ignoreNextClickRef.current = false;
        }, 0);
      }}
    >
      <div
        className="flex max-w-full flex-wrap items-end gap-x-1 gap-y-1.5"
        data-pronunciation-wrapped-content
        style={{ lineHeight: 1.15 }}
      >
        {annotations.map((annotation) => {
          const matching = marksAt(annotation.offset);
          const active = matching.some((mark) => mark.id === activeMarkId);
          const rangeActive =
            activeRange &&
            annotation.offset >= activeRange.startOffset &&
            annotation.offset < activeRange.endOffset;
          const firstMark = matching.find(
            (mark) => mark.startOffset === annotation.offset,
          );
          const markNumber = firstMark
            ? marks.findIndex((mark) => mark.id === firstMark.id) + 1
            : 0;
          const endOffset = annotation.offset + annotation.char.length;
          const tone = annotation.pinyin
            ? lang === "cantonese"
              ? extractToneFromJyutping(annotation.pinyin)
              : extractToneFromPinyin(annotation.pinyin)
            : 0;

          return (
            <span
              key={annotation.offset}
              className="inline-flex min-w-[1.05em] flex-col items-center align-top"
              data-pronunciation-unit
            >
              <span
                data-pronunciation-kind="romanization"
                data-pronunciation-offset={annotation.offset}
                data-pronunciation-end={endOffset}
                onClick={(event) =>
                  handleCellClick(event, annotation.offset, endOffset)
                }
                className={cn(
                  "whitespace-nowrap rounded-sm px-[0.08em] text-center leading-tight text-blue-400",
                  selectingKind !== null &&
                    selectingKind !== "romanization" &&
                    "select-none",
                  matching.length > 0 && markerClass,
                  (active || rangeActive) && "bg-amber-500/15",
                  (onSelectRange || onSelectMark) && "hover:bg-amber-500/10",
                )}
                style={{ fontSize: `${Math.round(fontSize * PINYIN_RATIO)}px` }}
              >
                {annotation.pinyin || "\u00a0"}
              </span>
              <span
                data-pronunciation-kind="chinese"
                data-pronunciation-offset={annotation.offset}
                data-pronunciation-end={endOffset}
                onClick={(event) =>
                  handleCellClick(event, annotation.offset, endOffset)
                }
                className={cn(
                  "relative whitespace-pre rounded-sm text-center leading-tight",
                  selectingKind !== null &&
                    selectingKind !== "chinese" &&
                    "select-none",
                  matching.length > 0 && markerClass,
                  (active || rangeActive) && "bg-amber-500/15",
                  (onSelectRange || onSelectMark) && "hover:bg-amber-500/10",
                )}
                style={{
                  fontSize: `${fontSize}px`,
                  ...(annotation.pinyin
                    ? getToneColorStyle(tone, lang)
                    : undefined),
                }}
              >
                {annotation.char}
                {markNumber > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 select-none items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm">
                    {markNumber}
                  </span>
                ) : null}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function PronunciationMarkerEditor({
  chinese,
  romanization,
  marks,
  lang,
  mediaElementId,
  onChange,
}: {
  chinese: string;
  romanization: string;
  marks: PronunciationMarkDto[];
  lang: "mandarin" | "cantonese";
  mediaElementId?: string;
  onChange: (marks: PronunciationMarkDto[]) => void;
}) {
  const annotations = useMemo(
    () => annotateFromModelAnswer(chinese, romanization),
    [chinese, romanization],
  );
  const [draft, setDraft] = useState<PronunciationMarkDto | null>(null);

  const startDraft = (startOffset: number, endOffset: number) => {
    const existing = marks.find(
      (mark) =>
        mark.startOffset === startOffset && mark.endOffset === endOffset,
    );
    if (existing) {
      setDraft(existing);
      return;
    }
    const expectedPronunciation = annotations
      .filter(
        (annotation) =>
          annotation.offset >= startOffset && annotation.offset < endOffset,
      )
      .map((annotation) => annotation.pinyin)
      .filter(Boolean)
      .join(" ");
    if (!expectedPronunciation) {
      toast.error("Select a Chinese character or word with pronunciation.");
      return;
    }
    setDraft({
      id: `new-${crypto.randomUUID()}`,
      startOffset,
      endOffset,
      originalText: chinese.slice(startOffset, endOffset),
      expectedPronunciation,
      issueType: "tone",
      note: "",
      audioTimestampSeconds: null,
    });
  };

  const saveDraft = () => {
    if (!draft?.expectedPronunciation.trim()) {
      toast.error("Expected pronunciation is required.");
      return;
    }
    const next = [
      ...marks.filter((mark) => mark.id !== draft.id),
      { ...draft, expectedPronunciation: draft.expectedPronunciation.trim() },
    ].sort((a, b) => a.startOffset - b.startOffset);
    onChange(next);
    setDraft(null);
  };

  const removeDraft = () => {
    if (!draft) return;
    onChange(marks.filter((mark) => mark.id !== draft.id));
    setDraft(null);
  };

  const captureTimestamp = () => {
    if (!mediaElementId) return null;
    const media = document.getElementById(mediaElementId);
    if (!(media instanceof HTMLMediaElement)) return null;
    return Math.max(0, Math.round(media.currentTime));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-background/60 px-3 py-3">
        <p className="mb-3 text-[11px] text-muted-foreground">
          Click a {lang === "cantonese" ? "Jyutping" : "Pinyin"} syllable or
          Chinese character, or drag across a word.
        </p>
        <PronunciationMarkedSentence
          chinese={chinese}
          romanization={romanization}
          marks={marks}
          lang={lang}
          activeMarkId={draft?.id}
          activeRange={
            draft
              ? {
                  startOffset: draft.startOffset,
                  endOffset: draft.endOffset,
                }
              : null
          }
          onSelectRange={startDraft}
          onSelectMark={setDraft}
        />
      </div>

      {draft ? (
        <div className="space-y-3 rounded-md border border-amber-500/35 bg-amber-500/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Pronunciation marker ·{" "}
              <span className="font-semibold text-foreground">
                {draft.originalText} · {draft.expectedPronunciation}
              </span>
            </p>
            {marks.some((mark) => mark.id === draft.id) ? (
              <button
                type="button"
                onClick={removeDraft}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove marker
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Issue type</span>
              <select
                value={draft.issueType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    issueType: event.target
                      .value as PronunciationMarkDto["issueType"],
                  })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {PRONUNCIATION_ISSUE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {PRONUNCIATION_ISSUE_LABELS[type]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Expected pronunciation</span>
              <input
                value={draft.expectedPronunciation}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    expectedPronunciation: event.target.value,
                  })
                }
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-foreground">
            <span>Coach note</span>
            <textarea
              value={draft.note}
              onChange={(event) =>
                setDraft({ ...draft, note: event.target.value })
              }
              rows={2}
              placeholder="Explain what the student should change."
              className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label
              className={cn(
                "inline-flex items-center gap-2 text-xs",
                mediaElementId
                  ? "text-foreground"
                  : "cursor-not-allowed text-muted-foreground",
              )}
            >
              <input
                type="checkbox"
                disabled={!mediaElementId}
                checked={draft.audioTimestampSeconds !== null}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    audioTimestampSeconds: event.target.checked
                      ? captureTimestamp()
                      : null,
                  })
                }
                className="h-4 w-4 accent-amber-500"
              />
              {draft.audioTimestampSeconds === null
                ? "Attach current recording time"
                : `Recording time ${formatTime(draft.audioTimestampSeconds)}`}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600"
              >
                Save pronunciation marker
              </button>
            </div>
          </div>
        </div>
      ) : marks.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {marks.map((mark, index) => (
            <button
              key={mark.id}
              type="button"
              onClick={() => setDraft(mark)}
              className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-300"
            >
              Pronunciation {index + 1}: {mark.originalText}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PronunciationFeedback({
  chinese,
  romanization,
  english,
  marks,
  lang,
  mediaElementId,
}: {
  chinese: string;
  romanization: string;
  english?: string | null;
  marks: PronunciationMarkDto[];
  lang: "mandarin" | "cantonese";
  mediaElementId?: string;
}) {
  const [playingMarkId, setPlayingMarkId] = useState<string | null>(null);

  const playFrom = async (mark: PronunciationMarkDto) => {
    if (!mediaElementId || mark.audioTimestampSeconds === null) return;
    const media = document.getElementById(mediaElementId);
    if (!(media instanceof HTMLMediaElement)) return;
    if (playingMarkId === mark.id && !media.paused) {
      media.pause();
      setPlayingMarkId(null);
      return;
    }
    media.currentTime = mark.audioTimestampSeconds;
    try {
      await media.play();
      setPlayingMarkId(mark.id);
      media.addEventListener("pause", () => setPlayingMarkId(null), {
        once: true,
      });
    } catch {
      setPlayingMarkId(null);
      toast.error("The recording could not start at that timestamp.");
    }
  };

  if (marks.length === 0) return null;

  return (
    <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
        <Volume2 className="h-4 w-4" />
        {marks.length} pronunciation {marks.length === 1 ? "note" : "notes"}
      </div>
      <PronunciationMarkedSentence
        chinese={chinese}
        romanization={romanization}
        marks={marks}
        lang={lang}
      />
      {english ? (
        <p className="text-lg italic text-muted-foreground">{english}</p>
      ) : null}
      <div className="space-y-2 border-t border-amber-500/20 pt-3">
        {marks.map((mark, index) => (
          <div
            key={mark.id}
            className="flex flex-wrap items-start justify-between gap-3 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">
                Pronunciation {index + 1}: {mark.originalText} · expected{" "}
                {mark.expectedPronunciation}
              </p>
              <p className="text-xs text-muted-foreground">
                {PRONUNCIATION_ISSUE_LABELS[mark.issueType]}
                {mark.note ? ` · ${mark.note}` : ""}
              </p>
            </div>
            {mark.audioTimestampSeconds !== null && mediaElementId ? (
              <button
                type="button"
                onClick={() => void playFrom(mark)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              >
                {playingMarkId === mark.id ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {playingMarkId === mark.id
                  ? "Pause"
                  : `Play from ${formatTime(mark.audioTimestampSeconds)}`}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
