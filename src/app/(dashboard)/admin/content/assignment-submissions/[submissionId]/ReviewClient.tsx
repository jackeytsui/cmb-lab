"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Highlighter, Loader2, Plus, Replace, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  CorrectedSentence,
  type RenderableCorrection,
} from "@/components/assignments/CorrectedSentence";
import {
  MandarinSentenceInput,
  type MandarinSentenceValue,
} from "@/components/assignments/MandarinSentenceInput";
import { calculateTextAssignmentScore } from "@/lib/assignment-scoring";
import {
  applyCorrectionChanges,
  hasConflictingCorrectionChanges,
  type AssignmentCorrectionOperation,
} from "@/lib/assignment-corrections";
import { isLoomUrl, sanitizeRecordingUrl } from "@/lib/recording-embed";
import { StudentSubmissionRecording } from "@/components/assignments/StudentSubmissionRecording";
import { ReviewerAutosaveStatus } from "@/components/assignments/ReviewerAutosaveStatus";
import { useReviewerAutosave } from "@/hooks/useReviewerAutosave";
import type { TextAssignmentReviewDraft } from "@/lib/assignment-review-draft";

export interface ReviewCorrectionDto extends RenderableCorrection {
  originalText: string;
  operation?: AssignmentCorrectionOperation;
}

export interface ReviewSentenceDto {
  id: string;
  promptLabel: string;
  promptDescription: string;
  chineseText: string;
  generatedPinyin: string;
  generatedEnglish: string;
  reviewVerdict: "correct" | "needs_correction" | null;
  corrections: ReviewCorrectionDto[];
}

export interface ReviewSubmissionDto {
  id: string;
  assignmentType: "text_assignment" | "diary";
  /** Romanisation/tone language of the lesson (jyutping for Cantonese). */
  lang: "mandarin" | "cantonese";
  status: "submitted" | "assigned" | "in_review" | "reviewed";
  submittedAt: string | null;
  reviewedAt: string | null;
  autoScore: number | null;
  finalScore: number | null;
  scoreOverridden: boolean;
  recordingUrl: string | null;
  extraComment: string | null;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  assignmentDescription: string;
  /** Student's own recording (Diary reads their entry aloud); URL to play. */
  studentAudioUrl?: string | null;
  reviewDraft: TextAssignmentReviewDraft | null;
  reviewDraftSavedAt: string | null;
  sentences: ReviewSentenceDto[];
}

type Verdict = "correct" | "needs_correction";

interface SentenceReviewState {
  verdict: Verdict;
  corrections: ReviewCorrectionDto[];
}

interface PendingSelection {
  sentenceId: string;
  operation?: "replace" | "insert";
  startOffset: number;
  endOffset: number;
  originalText: string;
}

/**
 * Map the current DOM selection inside a sentence container back to exact
 * character offsets using the data-offset attributes rendered by
 * CorrectedSentence.
 */
function getSelectionOffsets(
  container: HTMLElement,
  textLength: number,
): { start: number; end: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (
    !container.contains(range.startContainer) ||
    !container.contains(range.endContainer)
  ) {
    return null;
  }

  const resolveBoundary = (
    node: Node,
    offset: number,
    isStart: boolean,
  ): number | null => {
    let el: HTMLElement | null =
      node instanceof HTMLElement ? node : node.parentElement;
    while (el && el !== container && el.dataset?.offset === undefined) {
      el = el.parentElement;
    }
    if (el && el !== container && el.dataset?.offset !== undefined) {
      const base = parseInt(el.dataset.offset, 10);
      const len = el.textContent?.length ?? 1;
      if (node.nodeType === Node.TEXT_NODE) {
        if (isStart) return offset >= len ? base + len : base;
        return offset <= 0 ? base : base + len;
      }
      return isStart ? base : base + len;
    }
    // Boundary sits on the container itself (e.g. triple-click select-all).
    if (el === container || node === container) {
      return isStart ? 0 : textLength;
    }
    return null;
  };

  const start = resolveBoundary(range.startContainer, range.startOffset, true);
  const end = resolveBoundary(range.endContainer, range.endOffset, false);
  if (start === null || end === null) return null;

  const clampedStart = Math.max(0, Math.min(start, textLength));
  const clampedEnd = Math.max(0, Math.min(end, textLength));
  if (clampedEnd <= clampedStart) return null;
  return { start: clampedStart, end: clampedEnd };
}

export function ReviewClient({
  submission,
  returnHref,
}: {
  submission: ReviewSubmissionDto;
  returnHref: string;
}) {
  const router = useRouter();
  const isRereview = submission.status === "reviewed";

  const [reviews, setReviews] = useState<Record<string, SentenceReviewState>>(
    () => {
      const draftBySentenceId = new Map(
        submission.reviewDraft?.sentences.map((sentence) => [
          sentence.sentenceId,
          sentence,
        ]) ?? [],
      );
      return Object.fromEntries(
        submission.sentences.map((sentence) => [
          sentence.id,
          {
            verdict: draftBySentenceId.get(sentence.id)?.verdict ??
              sentence.reviewVerdict ??
              (sentence.corrections.length > 0 ? "needs_correction" : "correct"),
            corrections:
              draftBySentenceId.get(sentence.id)?.corrections ??
              sentence.corrections,
          },
        ]),
      );
    },
  );
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [correctionDraft, setCorrectionDraft] =
    useState<MandarinSentenceValue | null>(null);
  const [correctionGenerating, setCorrectionGenerating] = useState(false);
  const [insertionModeSentenceId, setInsertionModeSentenceId] = useState<
    string | null
  >(null);
  const [overrideInput, setOverrideInput] = useState<string>(
    submission.reviewDraft?.overrideInput ??
      (submission.scoreOverridden && submission.finalScore !== null
        ? String(submission.finalScore)
        : ""),
  );
  const [extraComment, setExtraComment] = useState(
    submission.reviewDraft?.extraComment ?? submission.extraComment ?? "",
  );
  const [recordingUrl, setRecordingUrl] = useState(
    submission.reviewDraft?.recordingUrl ?? submission.recordingUrl ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const reviewDraft = useMemo<TextAssignmentReviewDraft>(
    () => ({
      version: 1,
      kind: "text_assignment",
      sentences: submission.sentences.map((sentence) => {
        const state = reviews[sentence.id];
        return {
          sentenceId: sentence.id,
          verdict: state.verdict,
          corrections: state.corrections.map((correction) => ({
            id: correction.id,
            operation: correction.operation ?? "replace",
            startOffset: correction.startOffset,
            endOffset: correction.endOffset,
            originalText: correction.originalText,
            suggestedChinese: correction.suggestedChinese,
            suggestedPinyin: correction.suggestedPinyin,
            suggestedEnglish: correction.suggestedEnglish,
          })),
        };
      }),
      overrideInput,
      extraComment,
      recordingUrl,
    }),
    [extraComment, overrideInput, recordingUrl, reviews, submission.sentences],
  );
  const autosave = useReviewerAutosave({
    endpoint: `/api/admin/assignment-submissions/${submission.id}/review-draft`,
    value: reviewDraft,
    initialSavedAt: submission.reviewDraftSavedAt,
  });

  const autoScore = useMemo(
    () =>
      calculateTextAssignmentScore(
        submission.sentences.map((sentence) => {
          const state = reviews[sentence.id];
          return {
            chineseText: sentence.chineseText,
            corrections:
              state.verdict === "correct"
                ? []
                : state.corrections.map((correction) => ({
                    startOffset: correction.startOffset,
                    endOffset: correction.endOffset,
                    operation: correction.operation,
                    suggestedChinese: correction.suggestedChinese,
                  })),
          };
        }),
      ),
    [submission.sentences, reviews],
  );

  const overrideScore =
    overrideInput.trim() === "" ? null : Number(overrideInput);
  const overrideValid =
    overrideScore === null ||
    (Number.isInteger(overrideScore) &&
      overrideScore >= 0 &&
      overrideScore <= 100);
  const finalScore = overrideScore ?? autoScore;

  const recordingTrimmed = recordingUrl.trim();
  const recordingValid =
    recordingTrimmed === "" || sanitizeRecordingUrl(recordingTrimmed) !== null;
  const showLoomWarning =
    recordingTrimmed !== "" && recordingValid && !isLoomUrl(recordingTrimmed);

  const handleMouseUp = (sentence: ReviewSentenceDto) => {
    const container = sentenceRefs.current[sentence.id];
    if (!container) return;
    const offsets = getSelectionOffsets(
      container,
      sentence.chineseText.length,
    );
    if (!offsets) return;

    const state = reviews[sentence.id];
    const candidate = {
      operation: "replace" as const,
      startOffset: offsets.start,
      endOffset: offsets.end,
      originalText: sentence.chineseText.slice(offsets.start, offsets.end),
      suggestedChinese: "candidate",
    };
    if (
      hasConflictingCorrectionChanges([...state.corrections, candidate])
    ) {
      toast.error(
        "That selection overlaps an existing correction. Remove it first.",
      );
      window.getSelection()?.removeAllRanges();
      return;
    }

    setPendingSelection({
      sentenceId: sentence.id,
      startOffset: offsets.start,
      endOffset: offsets.end,
      originalText: sentence.chineseText.slice(offsets.start, offsets.end),
    });
    setInsertionModeSentenceId(null);
    setCorrectionDraft(null);
    window.getSelection()?.removeAllRanges();
  };

  const commitCorrection = () => {
    if (!pendingSelection?.operation || !correctionDraft) return;
    const correction: ReviewCorrectionDto = {
      id: `new-${crypto.randomUUID()}`,
      operation: pendingSelection.operation,
      startOffset: pendingSelection.startOffset,
      endOffset: pendingSelection.endOffset,
      originalText: pendingSelection.originalText,
      suggestedChinese: correctionDraft.chineseText,
      suggestedPinyin: correctionDraft.pinyin,
      suggestedEnglish: correctionDraft.english,
    };
    setReviews((prev) => ({
      ...prev,
      [pendingSelection.sentenceId]: {
        verdict: "needs_correction",
        corrections: [
          ...prev[pendingSelection.sentenceId].corrections,
          correction,
        ].sort((a, b) => a.startOffset - b.startOffset),
      },
    }));
    setPendingSelection(null);
    setCorrectionDraft(null);
  };

  const commitDeletion = () => {
    if (!pendingSelection || pendingSelection.originalText === "") return;
    const correction: ReviewCorrectionDto = {
      id: `new-${crypto.randomUUID()}`,
      operation: "delete",
      startOffset: pendingSelection.startOffset,
      endOffset: pendingSelection.endOffset,
      originalText: pendingSelection.originalText,
      suggestedChinese: "",
      suggestedPinyin: "",
      suggestedEnglish: "",
    };
    setReviews((prev) => ({
      ...prev,
      [pendingSelection.sentenceId]: {
        verdict: "needs_correction",
        corrections: [
          ...prev[pendingSelection.sentenceId].corrections,
          correction,
        ].sort((a, b) => a.startOffset - b.startOffset),
      },
    }));
    setPendingSelection(null);
    setCorrectionDraft(null);
  };

  const selectInsertionPoint = (sentence: ReviewSentenceDto, offset: number) => {
    const candidate: ReviewCorrectionDto = {
      id: "candidate",
      operation: "insert",
      startOffset: offset,
      endOffset: offset,
      originalText: "",
      suggestedChinese: "candidate",
      suggestedPinyin: "",
      suggestedEnglish: "",
    };
    if (
      hasConflictingCorrectionChanges([
        ...reviews[sentence.id].corrections,
        candidate,
      ])
    ) {
      toast.error("That position is already part of another review change.");
      return;
    }

    setPendingSelection({
      sentenceId: sentence.id,
      operation: "insert",
      startOffset: offset,
      endOffset: offset,
      originalText: "",
    });
    setCorrectionDraft(null);
    setInsertionModeSentenceId(null);
  };

  const removeCorrection = (sentenceId: string, correctionId: string) => {
    setReviews((prev) => {
      const corrections = prev[sentenceId].corrections.filter(
        (c) => c.id !== correctionId,
      );
      return {
        ...prev,
        [sentenceId]: {
          verdict:
            corrections.length === 0 ? "correct" : prev[sentenceId].verdict,
          corrections,
        },
      };
    });
  };

  const setVerdict = (sentenceId: string, verdict: Verdict) => {
    setReviews((prev) => ({
      ...prev,
      [sentenceId]: {
        verdict,
        corrections:
          verdict === "correct" ? [] : prev[sentenceId].corrections,
      },
    }));
    if (verdict === "correct" && pendingSelection?.sentenceId === sentenceId) {
      setPendingSelection(null);
      setCorrectionDraft(null);
    }
    if (verdict === "correct" && insertionModeSentenceId === sentenceId) {
      setInsertionModeSentenceId(null);
    }
  };

  const handleSubmit = async () => {
    if (!overrideValid) {
      toast.error("Override score must be a whole number from 0 to 100.");
      return;
    }
    if (!recordingValid) {
      toast.error("Recording link is not a valid URL.");
      return;
    }
    const incomplete = submission.sentences.find(
      (sentence) =>
        reviews[sentence.id].verdict === "needs_correction" &&
        reviews[sentence.id].corrections.length === 0,
    );
    if (incomplete) {
      toast.error(
        "A sentence is marked as needing correction but has no review changes. Replace, remove, or add words first.",
      );
      return;
    }

    setSubmitting(true);
    try {
      await autosave.prepareForSubmit();
      const res = await fetch(
        `/api/admin/assignment-submissions/${submission.id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: submission.sentences.map((sentence) => {
              const state = reviews[sentence.id];
              return {
                sentenceId: sentence.id,
                verdict: state.verdict,
                corrections: state.corrections.map((c) => ({
                  operation: c.operation ?? "replace",
                  startOffset: c.startOffset,
                  endOffset: c.endOffset,
                  originalText: c.originalText,
                  suggestedChinese: c.suggestedChinese,
                  suggestedPinyin: c.suggestedPinyin,
                  suggestedEnglish: c.suggestedEnglish,
                })),
              };
            }),
            overrideScore,
            extraComment,
            recordingUrl: recordingTrimmed || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        autosave.resumeAfterSubmitError();
        toast.error(data?.error || "Failed to submit review");
        return;
      }
      autosave.markSubmitted();
      toast.success(isRereview ? "Review updated" : "Review submitted");
      router.push(returnHref);
      router.refresh();
    } catch {
      autosave.resumeAfterSubmitError();
      toast.error("Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {submission.lessonTitle}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Student:{" "}
            <span className="text-foreground">
              {submission.studentName || submission.studentEmail}
            </span>
            {" · "}
            {submission.courseTitle} → {submission.moduleTitle}
            {submission.submittedAt && (
              <>
                {" · Submitted "}
                {new Date(submission.submittedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </>
            )}
          </p>
        </div>

        {/* Score card */}
        <div className="rounded-lg border border-border bg-card px-5 py-4 text-center space-y-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Auto Score
            </div>
            <div className="text-2xl font-bold text-foreground">
              {autoScore === null ? "—" : `${autoScore}%`}
            </div>
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
              Override Score
            </label>
            <div className="flex items-center justify-center gap-1">
              <input
                type="number"
                min={0}
                max={100}
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
                placeholder={autoScore === null ? "" : String(autoScore)}
                className={cn(
                  "w-20 rounded-md border bg-background px-2 py-1 text-sm text-center",
                  overrideValid ? "border-border" : "border-red-500",
                )}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            {!overrideValid && (
              <p className="mt-1 text-[11px] text-red-500">0–100 only</p>
            )}
            {overrideScore !== null && overrideValid && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Student will see {finalScore}%
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <ReviewerAutosaveStatus
          status={autosave.status}
          onRetry={() => void autosave.retry()}
        />
        <p className="text-[11px] text-muted-foreground">
          Drafts stay private. Submit Review makes the feedback visible to the
          student.
        </p>
      </div>

      <section
        aria-labelledby="review-options-guide"
        className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-5"
      >
        <div className="flex items-center gap-2">
          <Highlighter className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          <h2
            id="review-options-guide"
            className="text-sm font-semibold text-foreground"
          >
            Reviewer guide
          </h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          These options work for both Mandarin and Cantonese. Generated{" "}
          {submission.lang === "cantonese" ? "Jyutping" : "Pinyin"} and English
          remain editable before you save a suggestion.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-border/70 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Replace className="h-3.5 w-3.5 text-emerald-600" />
              Replace words
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Highlight existing text, choose Replace, then enter the corrected
              wording.
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
              Remove words
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Highlight unnecessary text and choose Remove. It will appear
              crossed out for the student.
            </p>
          </div>
          <div className="rounded-md border border-border/70 bg-background/70 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Plus className="h-3.5 w-3.5 text-emerald-600" />
              Add missing words
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Choose Add missing words, then click the + at the exact insertion
              point.
            </p>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Use the × on any saved change to undo it. The Suggested sentence
          preview shows all changes combined. Your review draft autosaves as
          you work.
        </p>
      </section>

      {/* Assignment description */}
      {submission.assignmentDescription && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-2">
            Assignment Description
          </h2>
          <div
            className="prose prose-invert prose-sm max-w-none text-foreground"
            dangerouslySetInnerHTML={{
              __html: submission.assignmentDescription,
            }}
          />
        </div>
      )}

      {submission.studentAudioUrl && (
        <StudentSubmissionRecording
          src={submission.studentAudioUrl}
          sticky={submission.assignmentType === "diary"}
        />
      )}

      {/* Sentences */}
      <div className="space-y-4">
        {submission.sentences.map((sentence, idx) => {
          const state = reviews[sentence.id];
          const isSelecting = pendingSelection?.sentenceId === sentence.id;
          const isInsertionMode = insertionModeSentenceId === sentence.id;
          const suggestedSentence = applyCorrectionChanges(
            sentence.chineseText,
            state.corrections,
          );
          return (
            <div
              key={sentence.id}
              className="rounded-lg border border-border bg-card p-5 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {idx + 1}. {sentence.promptLabel || `Sentence ${idx + 1}`}
                  </p>
                  {sentence.promptDescription && (
                    <p className="text-sm text-muted-foreground">
                      {sentence.promptDescription}
                    </p>
                  )}
                </div>
                <select
                  value={state.verdict}
                  onChange={(e) =>
                    setVerdict(sentence.id, e.target.value as Verdict)
                  }
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium",
                    state.verdict === "correct"
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                  )}
                >
                  <option value="correct">Correct</option>
                  <option value="needs_correction">Partially Correct</option>
                </select>
              </div>

              <div
                ref={(el) => {
                  sentenceRefs.current[sentence.id] = el;
                }}
                onMouseUp={() => handleMouseUp(sentence)}
                className="cursor-text select-text rounded-md bg-background/60 px-3 py-2"
              >
                <CorrectedSentence
                  text={sentence.chineseText}
                  corrections={state.corrections}
                  lang={submission.lang}
                  pinyin={sentence.generatedPinyin}
                  onRemoveCorrection={(correctionId) =>
                    removeCorrection(sentence.id, correctionId)
                  }
                  showInsertionPoints={isInsertionMode}
                  onSelectInsertionPoint={(offset) =>
                    selectInsertionPoint(sentence, offset)
                  }
                />
              </div>
              <p className="text-lg text-muted-foreground italic">
                {sentence.generatedEnglish}
              </p>
              {state.corrections.length > 0 && (
                <div className="rounded-md border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                    Suggested sentence
                  </span>
                  <p className="mt-0.5 text-lg text-foreground">
                    {suggestedSentence}
                  </p>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground/70">
                  Highlight text to replace or remove it.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setInsertionModeSentenceId(
                      isInsertionMode ? null : sentence.id,
                    );
                    setPendingSelection(null);
                    setCorrectionDraft(null);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    isInsertionMode
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border bg-background text-foreground hover:bg-accent",
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {isInsertionMode ? "Cancel adding" : "Add missing words"}
                </button>
              </div>
              {isInsertionMode && (
                <p className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-400">
                  Click a green + between characters to choose where the missing
                  words belong.
                </p>
              )}

              {isSelecting && pendingSelection && !pendingSelection.operation && (
                <div className="rounded-md border border-sky-500/40 bg-sky-500/5 p-3">
                  <p className="text-xs text-muted-foreground">
                    Selected:{" "}
                    <span className="font-medium text-red-500">
                      {pendingSelection.originalText}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPendingSelection((current) =>
                          current ? { ...current, operation: "replace" } : null,
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      <Replace className="h-3.5 w-3.5" />
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={commitDeletion}
                      className="inline-flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingSelection(null)}
                      className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {isSelecting && pendingSelection?.operation && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {pendingSelection.operation === "insert" ? (
                      "Adding missing words at the selected position"
                    ) : (
                      <>
                        Replacing:{" "}
                        <span className="text-red-500 line-through decoration-2">
                          {pendingSelection.originalText}
                        </span>
                      </>
                    )}
                  </p>
                  <MandarinSentenceInput
                    key={`${pendingSelection.sentenceId}:${pendingSelection.operation}:${pendingSelection.startOffset}:${pendingSelection.endOffset}`}
                    value={correctionDraft}
                    onValueChange={setCorrectionDraft}
                    onGeneratingChange={setCorrectionGenerating}
                    placeholder={
                      pendingSelection.operation === "insert"
                        ? "Type the missing words, then press Enter..."
                        : "Type the replacement, then press Enter..."
                    }
                    editButtonLabel="Edit suggestion"
                    lang={submission.lang}
                    compact
                    autoFocus
                    annotationEditable
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingSelection(null);
                        setCorrectionDraft(null);
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={commitCorrection}
                      disabled={!correctionDraft || correctionGenerating}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {pendingSelection.operation === "insert"
                        ? "Add words"
                        : "Save replacement"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Extra comment */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Extra Comment{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </h2>
        <RichTextEditor
          value={extraComment}
          onChange={setExtraComment}
          placeholder="Optional overall feedback for the student..."
          compact
        />
      </div>

      {/* Recording link */}
      <div className="rounded-lg border border-border bg-card p-5 space-y-2">
        <h2 className="text-sm font-semibold text-foreground">
          Review Recording Link{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </h2>
        <input
          type="url"
          value={recordingUrl}
          onChange={(e) => setRecordingUrl(e.target.value)}
          placeholder="https://www.loom.com/share/..."
          className={cn(
            "w-full rounded-md border bg-background px-3 py-2 text-sm",
            recordingValid ? "border-border" : "border-red-500",
          )}
        />
        {!recordingValid && (
          <p className="text-xs text-red-500">
            This is not a valid URL. Please paste a full link starting with
            https://
          </p>
        )}
        {showLoomWarning && (
          <p className="text-xs text-red-500">
            Warning: this does not look like a Loom link. Please double-check
            that the correct review recording link was pasted.
          </p>
        )}
        {recordingTrimmed !== "" && recordingValid && !showLoomWarning && (
          <p className="text-xs text-emerald-500">✓ Loom link detected</p>
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {isRereview ? "Update Review" : "Submit Review"}
        </button>
      </div>
    </div>
  );
}
