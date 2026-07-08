"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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
import {
  calculateTextAssignmentScore,
  hasOverlappingRanges,
} from "@/lib/assignment-scoring";
import { isLoomUrl, sanitizeRecordingUrl } from "@/lib/recording-embed";

export interface ReviewCorrectionDto extends RenderableCorrection {
  originalText: string;
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
  sentences: ReviewSentenceDto[];
}

type Verdict = "correct" | "needs_correction";

interface SentenceReviewState {
  verdict: Verdict;
  corrections: ReviewCorrectionDto[];
}

interface PendingSelection {
  sentenceId: string;
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
}: {
  submission: ReviewSubmissionDto;
}) {
  const router = useRouter();
  const isRereview = submission.status === "reviewed";

  const [reviews, setReviews] = useState<Record<string, SentenceReviewState>>(
    () =>
      Object.fromEntries(
        submission.sentences.map((sentence) => [
          sentence.id,
          {
            verdict:
              sentence.reviewVerdict ??
              (sentence.corrections.length > 0 ? "needs_correction" : "correct"),
            corrections: sentence.corrections,
          },
        ]),
      ),
  );
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [correctionDraft, setCorrectionDraft] =
    useState<MandarinSentenceValue | null>(null);
  const [correctionGenerating, setCorrectionGenerating] = useState(false);
  const [overrideInput, setOverrideInput] = useState<string>(
    submission.scoreOverridden && submission.finalScore !== null
      ? String(submission.finalScore)
      : "",
  );
  const [extraComment, setExtraComment] = useState(
    submission.extraComment ?? "",
  );
  const [recordingUrl, setRecordingUrl] = useState(
    submission.recordingUrl ?? "",
  );
  const [submitting, setSubmitting] = useState(false);

  const sentenceRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const autoScore = useMemo(
    () =>
      calculateTextAssignmentScore(
        submission.sentences.map((sentence) => {
          const state = reviews[sentence.id];
          return {
            chineseText: sentence.chineseText,
            corrections:
              state.verdict === "correct" ? [] : state.corrections,
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
      startOffset: offsets.start,
      endOffset: offsets.end,
    };
    if (
      hasOverlappingRanges([
        ...state.corrections.map((c) => ({
          startOffset: c.startOffset,
          endOffset: c.endOffset,
        })),
        candidate,
      ])
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
    setCorrectionDraft(null);
    window.getSelection()?.removeAllRanges();
  };

  const commitCorrection = () => {
    if (!pendingSelection || !correctionDraft) return;
    const correction: ReviewCorrectionDto = {
      id: `new-${crypto.randomUUID()}`,
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
        "A sentence is marked as needing correction but has no corrections. Highlight the incorrect part to add one.",
      );
      return;
    }

    setSubmitting(true);
    try {
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
        toast.error(data?.error || "Failed to submit review");
        return;
      }
      toast.success(isRereview ? "Review updated" : "Review submitted");
      router.push("/admin/content/assignment-submissions");
      router.refresh();
    } catch {
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
        <div className="rounded-lg border border-border bg-card p-5 space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            Student&apos;s recording
          </h2>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio
            controls
            preload="metadata"
            controlsList="nodownload"
            src={submission.studentAudioUrl}
            className="w-full"
          />
        </div>
      )}

      {/* Sentences */}
      <div className="space-y-4">
        {submission.sentences.map((sentence, idx) => {
          const state = reviews[sentence.id];
          const isSelecting = pendingSelection?.sentenceId === sentence.id;
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
                  onRemoveCorrection={(correctionId) =>
                    removeCorrection(sentence.id, correctionId)
                  }
                />
              </div>
              <p className="text-lg text-muted-foreground italic">
                {sentence.generatedEnglish}
              </p>
              <p className="text-[11px] text-muted-foreground/70">
                Highlight the incorrect part of the sentence to add a
                correction.
              </p>

              {isSelecting && pendingSelection && (
                <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Correcting:{" "}
                    <span className="text-red-500 line-through decoration-2">
                      {pendingSelection.originalText}
                    </span>
                  </p>
                  <MandarinSentenceInput
                    key={`${pendingSelection.sentenceId}:${pendingSelection.startOffset}:${pendingSelection.endOffset}`}
                    value={correctionDraft}
                    onValueChange={setCorrectionDraft}
                    onGeneratingChange={setCorrectionGenerating}
                    placeholder="Type the suggested correction, then press Enter..."
                    editButtonLabel="Edit correction"
                    compact
                    autoFocus
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
                      Add correction
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
