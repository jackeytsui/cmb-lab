"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PronunciationMarkerEditor } from "@/components/assignments/PronunciationMarker";
import { ReviewerAutosaveStatus } from "@/components/assignments/ReviewerAutosaveStatus";
import { SentenceVideo } from "@/components/assignments/SentenceVideo";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { useReviewerAutosave } from "@/hooks/useReviewerAutosave";
import type { PronunciationMarkDto } from "@/lib/assignment-pronunciation";
import type { VocalHackReviewDraft } from "@/lib/assignment-review-draft";
import { isLoomUrl, sanitizeRecordingUrl } from "@/lib/recording-embed";
import { cn } from "@/lib/utils";

// Vocal Hack review is pronunciation-only. Historical wording corrections are
// preserved when an old review is reopened, but are no longer editable here.

export interface VocalHackCorrection {
  chinese: string;
  pinyin: string;
  english: string;
}

export interface VocalHackReviewSentenceDto {
  id: string;
  promptLabel: string;
  chineseText: string;
  generatedPinyin: string;
  generatedEnglish: string;
  hasVideo: boolean;
  hasRecording: boolean;
  responseMediaType: "audio" | "video";
  corrections: VocalHackCorrection[];
  pronunciationMarks: PronunciationMarkDto[];
}

export interface VocalHackReviewDto {
  id: string;
  lessonId: string;
  /** Romanisation/tone language of the lesson (jyutping for Cantonese). */
  lang: "mandarin" | "cantonese";
  status: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  recordingUrl: string | null;
  extraComment: string | null;
  studentName: string | null;
  studentEmail: string;
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
  assignmentDescription: string;
  reviewDraft: VocalHackReviewDraft | null;
  reviewDraftSavedAt: string | null;
  sentences: VocalHackReviewSentenceDto[];
}

export function VocalHackReviewClient({
  submission,
  returnHref,
}: {
  submission: VocalHackReviewDto;
  returnHref: string;
}) {
  const router = useRouter();
  const preservedCorrections = useMemo<Record<string, VocalHackCorrection[]>>(
    () => {
      const draftBySentenceId = new Map(
        submission.reviewDraft?.sentences.map((sentence) => [
          sentence.sentenceId,
          sentence.corrections,
        ]) ?? [],
      );
      return Object.fromEntries(
        submission.sentences.map((sentence) => [
          sentence.id,
          draftBySentenceId.get(sentence.id) ?? sentence.corrections,
        ]),
      );
    },
    [submission.reviewDraft?.sentences, submission.sentences],
  );
  const [pronunciationMarks, setPronunciationMarks] = useState<
    Record<string, PronunciationMarkDto[]>
  >(() => {
    const draftBySentenceId = new Map(
      submission.reviewDraft?.sentences.map((sentence) => [
        sentence.sentenceId,
        sentence.pronunciationMarks,
      ]) ?? [],
    );
    return Object.fromEntries(
      submission.sentences.map((sentence) => [
        sentence.id,
        draftBySentenceId.get(sentence.id) ?? sentence.pronunciationMarks,
      ]),
    );
  });
  const [extraComment, setExtraComment] = useState(
    submission.reviewDraft?.extraComment ?? submission.extraComment ?? "",
  );
  const [recordingUrl, setRecordingUrl] = useState(
    submission.reviewDraft?.recordingUrl ?? submission.recordingUrl ?? "",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewDraft = useMemo<VocalHackReviewDraft>(
    () => ({
      version: 1,
      kind: "vocal_hack",
      sentences: submission.sentences.map((sentence) => ({
        sentenceId: sentence.id,
        corrections: preservedCorrections[sentence.id],
        pronunciationMarks: pronunciationMarks[sentence.id],
      })),
      extraComment,
      recordingUrl,
    }),
    [
      extraComment,
      preservedCorrections,
      pronunciationMarks,
      recordingUrl,
      submission.sentences,
    ],
  );
  const autosave = useReviewerAutosave({
    endpoint: `/api/admin/assignment-submissions/${submission.id}/review-draft`,
    value: reviewDraft,
    initialSavedAt: submission.reviewDraftSavedAt,
  });

  const recordingTrimmed = recordingUrl.trim();
  const recordingValid =
    recordingTrimmed === "" || Boolean(sanitizeRecordingUrl(recordingTrimmed));
  const showLoomWarning =
    recordingTrimmed !== "" && recordingValid && !isLoomUrl(recordingTrimmed);

  const handleSubmit = async () => {
    if (!recordingValid) {
      setError("Recording link is not a valid URL.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await autosave.prepareForSubmit();
      const res = await fetch(
        `/api/admin/assignment-submissions/${submission.id}/vocal-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: submission.sentences.map((sentence) => ({
              sentenceId: sentence.id,
              corrections: preservedCorrections[sentence.id],
              pronunciationMarks: pronunciationMarks[sentence.id].map(
                (mark) => ({
                  startOffset: mark.startOffset,
                  endOffset: mark.endOffset,
                  originalText: mark.originalText,
                  expectedPronunciation: mark.expectedPronunciation,
                  issueType: mark.issueType,
                  note: mark.note,
                  audioTimestampSeconds: mark.audioTimestampSeconds,
                }),
              ),
            })),
            extraComment,
            recordingUrl: recordingTrimmed || undefined,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        autosave.resumeAfterSubmitError();
        setError(data.error || "Failed to submit review");
        return;
      }
      autosave.markSubmitted();
      toast.success("Review submitted — the student has been notified.");
      router.push(returnHref);
      router.refresh();
    } catch {
      autosave.resumeAfterSubmitError();
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {submission.lessonTitle}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {submission.courseTitle} → {submission.moduleTitle}
            </p>
            <p className="mt-2 text-sm text-foreground">
              <span className="font-medium">
                {submission.studentName || "Unnamed"}
              </span>{" "}
              <span className="text-muted-foreground">
                ({submission.studentEmail})
              </span>
            </p>
          </div>
          <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-500">
            Vocal Hack
          </span>
        </div>
        {submission.assignmentDescription ? (
          <div
            className="prose prose-invert prose-sm mt-4 max-w-none border-t border-border pt-4 text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: submission.assignmentDescription,
            }}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
        <ReviewerAutosaveStatus
          status={autosave.status}
          onRetry={() => void autosave.retry()}
        />
        <p className="text-[11px] text-muted-foreground">
          Pronunciation notes, comments, and the recording link are saved
          privately as you work.
        </p>
      </div>

      <div className="space-y-5">
        {submission.sentences.map((sentence, idx) => (
          <div
            key={sentence.id}
            className="space-y-4 rounded-lg border border-border bg-card p-5"
          >
            <p className="text-sm font-semibold text-foreground">
              {idx + 1}. {sentence.promptLabel || `Sentence ${idx + 1}`}
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {sentence.hasVideo ? (
                <div className="flex justify-center sm:block sm:shrink-0">
                  <SentenceVideo
                    src={`/api/course-library/vocal-hack-video/${submission.lessonId}?sentence=${encodeURIComponent(sentence.id)}#t=0.1`}
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Student&apos;s recording
                </p>
                {sentence.hasRecording ? (
                  sentence.responseMediaType === "video" ? (
                    <video
                      id={`review-student-recording-${sentence.id}`}
                      controls
                      playsInline
                      preload="metadata"
                      controlsList="nodownload"
                      src={`/api/course-library/assignment-recordings/${sentence.id}`}
                      className="max-h-80 w-full rounded-md bg-black"
                    />
                  ) : (
                    <audio
                      id={`review-student-recording-${sentence.id}`}
                      controls
                      preload="metadata"
                      controlsList="nodownload"
                      src={`/api/course-library/assignment-recordings/${sentence.id}`}
                      className="w-full"
                    />
                  )
                ) : (
                  <p className="text-sm italic text-muted-foreground">
                    No recording submitted.
                  </p>
                )}
              </div>
            </div>

            <PronunciationMarkerEditor
              chinese={sentence.chineseText}
              romanization={sentence.generatedPinyin}
              english={sentence.generatedEnglish}
              marks={pronunciationMarks[sentence.id]}
              lang={submission.lang}
              mediaElementId={
                sentence.hasRecording
                  ? `review-student-recording-${sentence.id}`
                  : undefined
              }
              onChange={(marks) =>
                setPronunciationMarks((current) => ({
                  ...current,
                  [sentence.id]: marks,
                }))
              }
            />
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Extra Comment (optional)
        </h2>
        <RichTextEditor
          value={extraComment}
          onChange={setExtraComment}
          placeholder="Overall feedback on pronunciation, tones, pace..."
          compact
        />
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground">
          Recording Link (optional)
        </h2>
        <input
          type="url"
          value={recordingUrl}
          onChange={(event) => setRecordingUrl(event.target.value)}
          placeholder="https://www.loom.com/share/..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {!recordingValid ? (
          <p className="text-xs text-red-500">Not a valid URL.</p>
        ) : null}
        {showLoomWarning ? (
          <p className="text-xs text-amber-500">
            Warning: this does not look like a Loom link. Please double-check
            before submitting.
          </p>
        ) : null}
        {recordingTrimmed !== "" && recordingValid && !showLoomWarning ? (
          <p className="text-xs text-emerald-500">✓ Loom link detected</p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {submission.status === "reviewed" ? "Update review" : "Complete review"}
        </button>
      </div>
    </div>
  );
}
