"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Send, CheckCircle2 } from "lucide-react";
import { ASSIGNMENT_TYPE_LABELS } from "@/lib/assignment-types";
import type {
  AssignmentLessonType,
  ChallengeSubmissionData,
  VocalHackSubmissionData,
  DiarySubmissionData,
  AssignmentReviewData,
} from "@/lib/assignment-types";

interface SubmissionDetail {
  submission: {
    id: string;
    submissionData: string;
    status: string;
    createdAt: string;
  };
  lesson: {
    id: string;
    title: string;
    lessonType: string;
    assignmentConfig: string | null;
  };
  student: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
  review?: {
    reviewData: string;
    notifiedAt: string | null;
  } | null;
}

export default function SubmissionReviewPage() {
  const params = useParams();
  const router = useRouter();
  const submissionId = params.submissionId as string;

  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<string[]>([]);
  const [loomUrl, setLoomUrl] = useState("");
  const [overallFeedback, setOverallFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/assignments/submissions/${submissionId}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        if (d?.review?.reviewData) {
          const rev: AssignmentReviewData = JSON.parse(d.review.reviewData);
          setComments(rev.comments ?? []);
          setLoomUrl(rev.loomUrl ?? "");
          setOverallFeedback(rev.overallFeedback ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, [submissionId]);

  const handleSubmitReview = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/assignments/submissions/${submissionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comments, loomUrl, overallFeedback, notifyStudent: true }),
      });
      if (!res.ok) throw new Error("Review failed");
      setDone(true);
      setTimeout(() => router.push("/admin/assignments"), 1500);
    } catch {
      alert("Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <p className="text-zinc-400">Submission not found.</p>
      </div>
    );
  }

  const { submission, lesson, student } = data;
  const lessonType = lesson.lessonType as AssignmentLessonType;
  const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ") || student.email;
  let submissionData: Record<string, unknown> = {};
  try { submissionData = JSON.parse(submission.submissionData); } catch { /* ignore */ }
  let config: Record<string, unknown> = {};
  try { if (lesson.assignmentConfig) config = JSON.parse(lesson.assignmentConfig); } catch { /* ignore */ }

  const isReviewed = submission.status === "reviewed";

  // Ensure comments array is sized correctly
  const ensureComments = (n: number) => {
    setComments((prev) => {
      if (prev.length >= n) return prev;
      return [...prev, ...Array(n - prev.length).fill("")];
    });
  };

  return (
    <div className="min-h-screen bg-zinc-900 text-white">
      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
        <Link
          href="/admin/assignments"
          className="inline-flex items-center text-zinc-400 hover:text-white text-sm transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to submissions
        </Link>

        <div>
          <h1 className="text-xl font-bold">{lesson.title}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {ASSIGNMENT_TYPE_LABELS[lessonType]} · {studentName}
          </p>
          <p className="text-xs text-zinc-500">
            Submitted {new Date(submission.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {done && (
          <div className="flex items-center gap-3 rounded-lg border border-green-700/40 bg-green-950/30 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <p className="text-sm text-green-200 font-medium">Review submitted! Redirecting…</p>
          </div>
        )}

        {/* Challenge */}
        {lessonType === "challenge" && (() => {
          const d = submissionData as ChallengeSubmissionData;
          if (comments.length < d.sentences.length) ensureComments(d.sentences.length);
          return (
            <div className="space-y-4">
              {d.sentences.map((sentence, i) => (
                <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-2">
                  <p className="text-xs text-zinc-500">Sentence {i + 1}</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{sentence || <em className="text-zinc-500">Empty</em>}</p>
                  <textarea
                    value={comments[i] ?? ""}
                    onChange={(e) => {
                      const next = [...comments];
                      next[i] = e.target.value;
                      setComments(next);
                    }}
                    rows={2}
                    placeholder="Coach feedback for this sentence…"
                    className="w-full resize-y rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                    disabled={isReviewed}
                  />
                </div>
              ))}
            </div>
          );
        })()}

        {/* Vocal Hack */}
        {lessonType === "vocal_hack" && (() => {
          const d = submissionData as VocalHackSubmissionData;
          const sentences = (config.sentences as Array<{ chinese: string; pinyin: string; english: string }>) ?? [];
          if (comments.length < sentences.length) ensureComments(sentences.length);
          return (
            <div className="space-y-4">
              {sentences.map((s, i) => {
                const rec = d.recordings?.find((r) => r.index === i);
                return (
                  <div key={i} className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4 space-y-3">
                    <div>
                      <p className="text-xs text-zinc-500">Sentence {i + 1}</p>
                      <p className="text-lg text-white">{s.chinese}</p>
                      <p className="text-sm text-zinc-400">{s.pinyin} · <em>{s.english}</em></p>
                    </div>
                    {rec ? (
                      /* eslint-disable-next-line jsx-a11y/media-has-caption */
                      <audio
                        controls
                        src={`/api/assignments/stream-recording?submissionId=${encodeURIComponent(submissionId)}&index=${i}`}
                        className="w-full"
                        preload="none"
                      />
                    ) : (
                      <p className="text-xs text-zinc-500 italic">No recording for this sentence.</p>
                    )}
                    <textarea
                      value={comments[i] ?? ""}
                      onChange={(e) => {
                        const next = [...comments];
                        next[i] = e.target.value;
                        setComments(next);
                      }}
                      rows={2}
                      placeholder="Coach feedback for this sentence…"
                      className="w-full resize-y rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                      disabled={isReviewed}
                    />
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* Diary Challenge */}
        {lessonType === "diary_challenge" && (() => {
          const d = submissionData as DiarySubmissionData;
          if (comments.length < 1) ensureComments(1);
          return (
            <div className="space-y-4">
              {d.text && (
                <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 p-4">
                  <p className="text-xs text-zinc-500 mb-2">Student&apos;s diary entry</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{d.text}</p>
                </div>
              )}
              {d.audioBlobUrl && (
                /* eslint-disable-next-line jsx-a11y/media-has-caption */
                <audio
                  controls
                  src={`/api/assignments/stream-recording?submissionId=${encodeURIComponent(submissionId)}`}
                  className="w-full"
                  preload="none"
                />
              )}
              <textarea
                value={comments[0] ?? ""}
                onChange={(e) => setComments([e.target.value])}
                rows={4}
                placeholder="Coach feedback…"
                className="w-full resize-y rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                disabled={isReviewed}
              />
            </div>
          );
        })()}

        {/* Common review fields */}
        {!isReviewed && (
          <div className="space-y-4 pt-4 border-t border-zinc-700">
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Loom video link (optional)</label>
              <input
                type="url"
                value={loomUrl}
                onChange={(e) => setLoomUrl(e.target.value)}
                placeholder="https://www.loom.com/share/..."
                className="w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-zinc-300">Overall feedback (optional)</label>
              <textarea
                value={overallFeedback}
                onChange={(e) => setOverallFeedback(e.target.value)}
                rows={3}
                placeholder="Overall comments for the student…"
                className="w-full resize-y rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={handleSubmitReview}
              disabled={submitting || done}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
              {submitting ? "Submitting…" : "Submit Review & Notify Student"}
            </button>
          </div>
        )}

        {isReviewed && (
          <div className="flex items-center gap-3 rounded-lg border border-green-700/40 bg-green-950/20 p-4">
            <CheckCircle2 className="h-5 w-5 text-green-400" />
            <p className="text-sm text-green-300">This submission has been reviewed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
