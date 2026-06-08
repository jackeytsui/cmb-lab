"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Send } from "lucide-react";
import { AudioRecorder } from "./AudioRecorder";
import type { DiarySubmissionData, AssignmentReviewData } from "@/lib/assignment-types";

interface DiaryChalllengeProps {
  lessonId: string;
  confirmationMessage?: string | null;
}

export function DiaryChallenge({ lessonId, confirmationMessage }: DiaryChalllengeProps) {
  const [text, setText] = useState("");
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<AssignmentReviewData | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/assignments/${lessonId}/submission`)
      .then((r) => r.json())
      .then(({ submission }) => {
        if (!submission) return;
        setSubmissionId(submission.id);
        setExistingStatus(submission.status);
        const data: DiarySubmissionData = JSON.parse(submission.submissionData);
        setText(data.text ?? "");
        setAudioBlobUrl(data.audioBlobUrl ?? null);
        setSubmitted(true);
        if (submission.review?.reviewData) {
          setReview(JSON.parse(submission.review.reviewData));
        }
      })
      .catch(() => null);
  }, [lessonId]);

  const handleSubmit = async () => {
    if (!text.trim() && !audioBlobUrl) {
      setError("Please write your diary entry or record audio before submitting.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const data: DiarySubmissionData = {
        text,
        audioBlobUrl: audioBlobUrl ?? "",
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
      const { submission: saved } = await res.json();
      setSubmissionId(saved.id);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReviewed = existingStatus === "reviewed";

  if (submitted && isReviewed) {
    return (
      <div className="mt-8 space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-blue-700/40 bg-blue-950/30 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-blue-400 mt-0.5" />
          <p className="text-sm text-blue-200 font-medium">Your coach has reviewed this diary entry.</p>
        </div>

        {text && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
            <p className="text-xs text-zinc-500 mb-2">Your entry</p>
            <p className="text-sm text-zinc-200 whitespace-pre-wrap">{text}</p>
          </div>
        )}

        {submissionId && audioBlobUrl && (
          /* eslint-disable-next-line jsx-a11y/media-has-caption */
          <audio
            controls
            src={`/api/assignments/stream-recording?submissionId=${encodeURIComponent(submissionId)}`}
            className="w-full"
            preload="none"
          />
        )}

        {review?.comments[0] && (
          <div className="rounded-lg border border-blue-700/30 bg-blue-950/20 p-4">
            <p className="text-xs text-blue-400 font-medium mb-1">Coach feedback</p>
            <p className="text-sm text-blue-200 whitespace-pre-wrap">{review.comments[0]}</p>
          </div>
        )}

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
    );
  }

  if (submitted && !isReviewed) {
    return (
      <div className="mt-8 space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-green-700/40 bg-green-950/30 p-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-300">Submitted — awaiting review</p>
            {confirmationMessage && (
              <p className="mt-1 text-sm text-green-200 whitespace-pre-wrap">{confirmationMessage}</p>
            )}
          </div>
        </div>
        {text && (
          <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
            <p className="text-xs text-zinc-500 mb-1">Your entry</p>
            <p className="text-sm text-zinc-300 whitespace-pre-wrap">{text}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-5">
      <h3 className="text-lg font-semibold text-white">Your Diary Entry</h3>

      {error && (
        <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left: Text */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-300">Write your entry</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            placeholder="开始写你的日记…"
            className="w-full resize-y rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
          />
          <p className="text-xs text-zinc-500">
            Tip: Use the{" "}
            <a
              href={`/dashboard/reader`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300"
            >
              Reader
            </a>{" "}
            to check pinyin and translation.
          </p>
        </div>

        {/* Right: Audio */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-zinc-300">Record yourself reading it aloud</label>
          <AudioRecorder
            onUpload={(url) => setAudioBlobUrl(url)}
            existingUrl={audioBlobUrl}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <Send className="w-4 h-4" />
        {isSubmitting ? "Submitting…" : "Submit"}
      </button>
    </div>
  );
}
