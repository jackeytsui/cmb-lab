"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Info, Loader2, Lock, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AudioRecorder,
  type RecordingMediaType,
} from "@/components/assignments/AudioRecorder";
import { ModelAnnotatedSentence } from "@/components/assignments/ModelAnnotatedSentence";
import { SentenceVideo } from "@/components/assignments/SentenceVideo";

// ---------------------------------------------------------------------------
// Student-facing Vocal Hack: watch the coach video for each sentence, record
// yourself reading it (listen back / re-record freely), then submit everything
// at the end for human review. Mirrors the Text Assignment lifecycle: editable
// until review starts, then locked; reviewed submissions link to feedback.
// ---------------------------------------------------------------------------

export interface VocalHackSentenceDto {
  id: string;
  chinese: string;
  pinyin: string;
  english: string;
  hasVideo: boolean;
  sourcePromptText: string | null;
  allowedResponseTypes: RecordingMediaType[];
}

export interface VocalHackSubmissionDto {
  id: string;
  status: string;
  submittedAt: string | null;
  /** sentenceId (promptId) → uploaded recording blob URL (for resubmission). */
  recordings: Record<string, string>;
  /** sentenceId (promptId) → authenticated proxy URL for playback. */
  playbackUrls: Record<string, string>;
  /** sentenceId (promptId) → submitted recording type. */
  recordingMediaTypes: Record<string, RecordingMediaType>;
}

const LOCKED_STATUSES = new Set(["in_review", "reviewed"]);

export function VocalHackViewer({
  lessonId,
  videoBaseUrl,
  sentences,
  initialSubmission,
  maxResponseSeconds = 300,
  lang = "mandarin",
  feedbackEnabled = true,
}: {
  lessonId: string;
  /** Server-minted, expiring URL for the private coach-video proxy. */
  videoBaseUrl: string;
  sentences: VocalHackSentenceDto[];
  initialSubmission: VocalHackSubmissionDto | null;
  maxResponseSeconds?: number;
  lang?: "mandarin" | "cantonese";
  feedbackEnabled?: boolean;
}) {
  const [submission, setSubmission] = useState<VocalHackSubmissionDto | null>(
    initialSubmission,
  );
  const [recordings, setRecordings] = useState<Record<string, string>>(
    () => ({ ...(initialSubmission?.recordings ?? {}) }),
  );
  // Playback sources: server-side recordings play via the authenticated proxy;
  // freshly-made recordings play from the recorder's local object URL instead.
  const [playbackUrls, setPlaybackUrls] = useState<Record<string, string>>(
    () => ({ ...(initialSubmission?.playbackUrls ?? {}) }),
  );
  const [recordingMediaTypes, setRecordingMediaTypes] = useState<
    Record<string, RecordingMediaType>
  >(() => ({ ...(initialSubmission?.recordingMediaTypes ?? {}) }));
  const [replacementSentenceIds, setReplacementSentenceIds] = useState<
    Set<string>
  >(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = submission ? LOCKED_STATUSES.has(submission.status) : false;
  const recordedCount = useMemo(
    () => sentences.filter((s) => recordings[s.id]).length,
    [sentences, recordings],
  );
  const allRecorded = recordedCount === sentences.length;

  const handleSubmit = async () => {
    if (!allRecorded) {
      setError("Please record every sentence before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const isResubmit = Boolean(submission?.submittedAt);
    try {
      const res = await fetch(
        `/api/course-library/lessons/${lessonId}/vocal-hack-submission`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recordings: sentences.map((s) => ({
              sentenceId: s.id,
              audioUrl: recordings[s.id],
              mediaType: recordingMediaTypes[s.id] ?? "audio",
            })),
            replacementSentenceIds: [...replacementSentenceIds],
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setSubmission((prev) =>
            prev ? { ...prev, status: "in_review" } : prev,
          );
        }
        setError(data.error || "Failed to submit");
        return;
      }
      const sub = data.submission;
      const nextPlayback: Record<string, string> = {};
      const nextMediaTypes: Record<string, RecordingMediaType> = {};
      for (const s of sub.sentences ?? []) {
        if (s.audioUrl) {
          nextPlayback[s.promptId] =
            `/api/course-library/assignment-recordings/${s.id}`;
          nextMediaTypes[s.promptId] =
            s.responseMediaType === "video" ? "video" : "audio";
        }
      }
      setPlaybackUrls(nextPlayback);
      setRecordingMediaTypes(nextMediaTypes);
      setSubmission({
        id: sub.id,
        status: sub.status,
        submittedAt: sub.submittedAt,
        recordings,
        playbackUrls: nextPlayback,
        recordingMediaTypes: nextMediaTypes,
      });
      setReplacementSentenceIds(new Set());
      toast.success(
        isResubmit ? "Recordings resubmitted!" : "Recordings submitted!",
        {
          description: feedbackEnabled
            ? "You'll receive personalised feedback from our coaching team very soon."
            : "Your recording practice has been saved.",
        },
      );
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div
        role="note"
        data-testid="vocal-hack-source-of-truth"
        className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3.5 text-foreground"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white">
          <Info className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">Video is the source of truth</p>
          <p className="text-sm leading-5 text-muted-foreground">
            If any wording, pronunciation, or meaning shown in CMB Lab differs
            from the coach video, follow the coach video.
          </p>
        </div>
      </div>

      {!locked && (
        <div
          role="note"
          className="flex items-start gap-3 rounded-lg border border-primary/25 bg-primary/8 px-4 py-3.5 text-foreground dark:bg-primary/10"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Info className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">Submit one response per question</p>
            <p className="text-sm leading-5 text-muted-foreground">
              Choose audio, video, or one uploaded file. Once it is saved, the
              other formats stay unavailable. To switch formats, remove the
              saved response first.
            </p>
          </div>
        </div>
      )}

      {submission?.submittedAt && (
        <div
          className={cn(
            "rounded-md border px-4 py-3 text-sm flex items-start gap-2",
            locked
              ? "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
          )}
        >
          {locked ? (
            <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          )}
          <div>
            {submission.status === "reviewed" ? (
              <>
                Your recordings have been reviewed.{" "}
                <Link
                  href={`/dashboard/assignment-feedback/${submission.id}`}
                  className="underline font-medium"
                >
                  View your feedback
                </Link>
              </>
            ) : locked ? (
              "Your submission is currently being reviewed and can no longer be edited."
            ) : (
              <>
                <span className="font-medium">Submitted!</span>{" "}
                {feedbackEnabled
                  ? "You'll receive personalised feedback from our coaching team very soon. You can still re-record and resubmit until it has been reviewed."
                  : "Your recording practice has been saved. You can still re-record and resubmit it at any time."}
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {sentences.map((sentence, idx) => (
          <div
            key={sentence.id}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {idx + 1}
              </span>
              {recordings[sentence.id] && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Recorded
                </span>
              )}
            </div>

            {/* Video left, sentence + recorder right (stacks on mobile). */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {sentence.hasVideo && (
                <div className="flex justify-center sm:block sm:shrink-0">
                  <SentenceVideo
                    src={`${videoBaseUrl}&sentence=${encodeURIComponent(sentence.id)}#t=0.1`}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1 space-y-3">
                {sentence.sourcePromptText && (
                  <p className="text-sm font-medium text-foreground">
                    {sentence.sourcePromptText}
                  </p>
                )}
                <div className="rounded-md bg-background px-3 py-3">
                  <ModelAnnotatedSentence
                    chinese={sentence.chinese}
                    pinyin={sentence.pinyin}
                    english={sentence.english}
                    lang={lang}
                  />
                </div>
                {!locked ? (
                  <AudioRecorder
                    existingUrl={playbackUrls[sentence.id] ?? null}
                    existingMediaType={
                      recordingMediaTypes[sentence.id] ?? "audio"
                    }
                    allowedMediaTypes={sentence.allowedResponseTypes}
                    allowFileUpload
                    maxSeconds={maxResponseSeconds}
                    onRemove={() => {
                      setReplacementSentenceIds((prev) => {
                        const next = new Set(prev);
                        next.add(sentence.id);
                        return next;
                      });
                      setRecordings((prev) => {
                        const next = { ...prev };
                        delete next[sentence.id];
                        return next;
                      });
                      setPlaybackUrls((prev) => {
                        const next = { ...prev };
                        delete next[sentence.id];
                        return next;
                      });
                      setRecordingMediaTypes((prev) => {
                        const next = { ...prev };
                        delete next[sentence.id];
                        return next;
                      });
                    }}
                    onUpload={(url, mediaType) => {
                      setRecordings((prev) => ({
                        ...prev,
                        [sentence.id]: url,
                      }));
                      setRecordingMediaTypes((prev) => ({
                        ...prev,
                        [sentence.id]: mediaType,
                      }));
                    }}
                  />
                ) : (
                  playbackUrls[sentence.id] && (
                    recordingMediaTypes[sentence.id] === "video" ? (
                      <video
                        aria-label="Your submitted video"
                        controls
                        playsInline
                        preload="metadata"
                        controlsList="nodownload"
                        onContextMenu={(e) => e.preventDefault()}
                        src={playbackUrls[sentence.id]}
                        className="max-h-80 w-full rounded-md bg-black"
                      />
                    ) : (
                      <audio
                        aria-label="Your submitted audio"
                        controls
                        preload="none"
                        controlsList="nodownload"
                        onContextMenu={(e) => e.preventDefault()}
                        src={playbackUrls[sentence.id]}
                        className="w-full"
                      />
                    )
                  )
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {!locked && (
        <div className="flex items-center justify-end gap-3">
          <span className="text-xs text-muted-foreground">
            {recordedCount} of {sentences.length} recorded
          </span>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !allRecorded}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {submission?.submittedAt ? "Resubmit" : "Submit"}
          </button>
        </div>
      )}
    </div>
  );
}
