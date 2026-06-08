"use client";

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, CheckCircle2, Send } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import { InteractiveVideoPlayer } from "@/components/video/InteractiveVideoPlayer";
import type { VocalHackConfig, VocalHackSubmissionData, AssignmentReviewData } from "@/lib/assignment-types";

interface VocalHackAssignmentProps {
  lessonId: string;
  config: VocalHackConfig;
  confirmationMessage?: string | null;
}

export function VocalHackAssignment({ lessonId, config, confirmationMessage }: VocalHackAssignmentProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recordings, setRecordings] = useState<(string | null)[]>(
    Array(config.sentences.length).fill(null),
  );
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<AssignmentReviewData | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assignments/${lessonId}/submission`)
      .then((r) => r.json())
      .then(({ submission }) => {
        if (!submission) return;
        setExistingStatus(submission.status);
        const data: VocalHackSubmissionData = JSON.parse(submission.submissionData);
        const filled = Array(config.sentences.length)
          .fill(null)
          .map((_, i) => data.recordings.find((r) => r.index === i)?.blobUrl ?? null);
        setRecordings(filled);
        setSubmitted(true);
        if (submission.review?.reviewData) {
          setReview(JSON.parse(submission.review.reviewData));
        }
      })
      .catch(() => null);
  }, [lessonId, config.sentences.length]);

  const handleRecorded = (index: number, blobUrl: string) => {
    setRecordings((prev) => {
      const next = [...prev];
      next[index] = blobUrl;
      return next;
    });
  };

  const handleSubmit = async () => {
    const complete = recordings.filter(Boolean);
    if (complete.length === 0) {
      setError("Please record at least one sentence before submitting.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const data: VocalHackSubmissionData = {
        recordings: recordings
          .map((url, index) => (url ? { index, blobUrl: url } : null))
          .filter((r): r is { index: number; blobUrl: string } => r !== null),
      };
      const res = await fetch(`/api/assignments/${lessonId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionData: JSON.stringify(data) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Submit failed");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const sentence = config.sentences[currentIndex];
  const totalSentences = config.sentences.length;
  const recordedCount = recordings.filter(Boolean).length;
  const isReviewed = existingStatus === "reviewed";

  if (!sentence) return null;

  return (
    <div className="mt-8 space-y-5">
      {submitted && !isReviewed ? (
        // Submitted state
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-green-700/40 bg-green-950/30 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-300">Submitted — awaiting review</p>
              {confirmationMessage && (
                <p className="mt-1 text-sm text-green-200 whitespace-pre-wrap">{confirmationMessage}</p>
              )}
            </div>
          </div>
          <p className="text-sm text-zinc-400">{recordedCount} of {totalSentences} sentences recorded.</p>
        </div>
      ) : submitted && isReviewed ? (
        // Reviewed state
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-blue-700/40 bg-blue-950/30 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
            <p className="text-sm text-blue-200 font-medium">Your coach has reviewed this submission.</p>
          </div>

          {config.sentences.map((s, i) => (
            <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <p className="text-xs text-zinc-500">Sentence {i + 1}</p>
                <p className="text-sm text-white">{s.chinese}</p>
                <p className="text-xs text-zinc-400">{s.pinyin}</p>
                <p className="text-xs text-zinc-500 italic">{s.english}</p>
              </div>
              {recordings[i] && (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <audio
                  controls
                  src={`/api/assignments/stream-recording?submissionId=${encodeURIComponent("")}&index=${i}`}
                  className="w-full"
                  preload="none"
                />
              )}
              {review?.comments[i] && (
                <div className="rounded bg-blue-950/30 border border-blue-700/30 p-2">
                  <p className="text-xs text-blue-400 font-medium mb-0.5">Coach feedback</p>
                  <p className="text-sm text-blue-200 whitespace-pre-wrap">{review.comments[i]}</p>
                </div>
              )}
            </div>
          ))}

          {review?.loomUrl && (
            <a
              href={review.loomUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Watch coach video feedback →
            </a>
          )}
          {review?.overallFeedback && (
            <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4">
              <p className="text-xs text-zinc-400 mb-1">Overall Feedback</p>
              <p className="text-sm text-zinc-200 whitespace-pre-wrap">{review.overallFeedback}</p>
            </div>
          )}
        </div>
      ) : (
        // Recording form
        <>
          {/* Navigation */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Vocal Hack</h3>
            <span className="text-sm text-zinc-400">
              {currentIndex + 1} / {totalSentences}
            </span>
          </div>

          {error && (
            <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* Sentence card */}
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-5 space-y-4">
            {/* Video */}
            {sentence.muxPlaybackId && (
              <div className="rounded-lg overflow-hidden">
                <InteractiveVideoPlayer
                  playbackId={sentence.muxPlaybackId}
                  cuePoints={[]}
                  lessonId={lessonId}
                  courseId=""
                  title={sentence.chinese}
                />
              </div>
            )}

            {/* Text */}
            <div className="space-y-1 pt-1">
              <p className="text-sm text-zinc-400">{sentence.pinyin}</p>
              <p className="text-xl font-medium text-white">{sentence.chinese}</p>
              <p className="text-sm text-zinc-400 italic">{sentence.english}</p>
            </div>

            {/* Recorder */}
            <AudioRecorder
              onUpload={(url) => handleRecorded(currentIndex, url)}
              existingUrl={recordings[currentIndex]}
            />

            {recordings[currentIndex] && (
              <p className="text-xs text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Recording uploaded
              </p>
            )}
          </div>

          {/* Prev / Next */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
              className="flex items-center gap-1 rounded-lg border border-zinc-600 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Prev
            </button>

            {currentIndex < totalSentences - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i + 1)}
                className="flex items-center gap-1 rounded-lg bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600 transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || recordedCount === 0}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? "Submitting…" : `Submit (${recordedCount}/${totalSentences} recorded)`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
