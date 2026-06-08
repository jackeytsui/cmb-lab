"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Send, Pencil } from "lucide-react";
import type { ChallengeConfig, ChallengeSubmissionData, AssignmentReviewData } from "@/lib/assignment-types";

interface ChallengeAssignmentProps {
  lessonId: string;
  config: ChallengeConfig;
  confirmationMessage?: string | null;
}

interface ExistingSubmission {
  id: string;
  submissionData: string;
  status: string;
  review?: {
    reviewData: string;
    notifiedAt: string | null;
  } | null;
}

export function ChallengeAssignment({ lessonId, config, confirmationMessage }: ChallengeAssignmentProps) {
  const count = Math.min(Math.max(config.sentenceCount ?? 1, 1), 9);
  const [sentences, setSentences] = useState<string[]>(Array(count).fill(""));
  const [submitted, setSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<ExistingSubmission | null>(null);
  const [review, setReview] = useState<AssignmentReviewData | null>(null);

  useEffect(() => {
    fetch(`/api/assignments/${lessonId}/submission`)
      .then((r) => r.json())
      .then(({ submission }) => {
        if (!submission) return;
        setExisting(submission);
        const data: ChallengeSubmissionData = JSON.parse(submission.submissionData);
        const filled = Array(count).fill("").map((_, i) => data.sentences[i] ?? "");
        setSentences(filled);
        setSubmitted(true);
        if (submission.review?.reviewData) {
          setReview(JSON.parse(submission.review.reviewData));
        }
      })
      .catch(() => null);
  }, [lessonId, count]);

  const handleSubmit = async () => {
    if (sentences.every((s) => !s.trim())) {
      setError("Please fill in at least one sentence before submitting.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const data: ChallengeSubmissionData = { sentences };
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
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isReviewed = existing?.status === "reviewed";
  const showForm = !submitted || isEditing;

  return (
    <div className="mt-8 space-y-5">
      <h3 className="text-lg font-semibold text-white">Your Submission</h3>

      {error && (
        <div className="rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {showForm ? (
        <>
          <div className="space-y-3">
            {sentences.map((val, i) => (
              <div key={i} className="space-y-1">
                <label className="text-xs font-medium text-zinc-400">
                  Sentence {i + 1}
                </label>
                <textarea
                  value={val}
                  onChange={(e) => {
                    const next = [...sentences];
                    next[i] = e.target.value;
                    setSentences(next);
                  }}
                  rows={2}
                  className="w-full resize-y rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  placeholder={`Write sentence ${i + 1}…`}
                />
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {isSubmitting ? "Submitting…" : "Submit"}
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* Confirmation / submitted state */}
          <div className="flex items-start gap-3 rounded-lg border border-green-700/40 bg-green-950/30 p-4">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-300">Submitted</p>
              {confirmationMessage && (
                <p className="mt-1 text-sm text-green-200 whitespace-pre-wrap">{confirmationMessage}</p>
              )}
            </div>
          </div>

          {/* Show sentences */}
          <div className="space-y-2">
            {sentences.map((val, i) => (
              <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-3">
                <p className="text-xs text-zinc-500 mb-1">Sentence {i + 1}</p>
                <p className="text-sm text-zinc-200">{val || <span className="italic text-zinc-500">Empty</span>}</p>
                {review?.comments[i] && (
                  <div className="mt-2 rounded bg-blue-950/30 border border-blue-700/30 p-2">
                    <p className="text-xs text-blue-400 font-medium mb-0.5">Coach feedback</p>
                    <p className="text-sm text-blue-200 whitespace-pre-wrap">{review.comments[i]}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

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

          {!isReviewed && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit submission
            </button>
          )}
        </div>
      )}
    </div>
  );
}
