"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Lock, Pencil, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioRecorder } from "@/components/assignments/AudioRecorder";
import { AnnotatedSentence } from "@/components/assignments/AnnotatedSentence";
import { ModelAnnotatedSentence } from "@/components/assignments/ModelAnnotatedSentence";
import { generateAnnotation } from "@/lib/mandarin-generation";

// Diary entries run long, so the post-generation text is a touch smaller than
// the default assignment sizes (26 / 18) while keeping the same
// pinyin : chinese : english ratio (pinyin is derived at ~0.69× the char size,
// and english tracks the char size at the same 0.69× proportion).
const DIARY_CHAR_SIZE = 22;
const DIARY_ENGLISH_SIZE = 15;

// ---------------------------------------------------------------------------
// Diary lesson: student writes a paragraph (left) and records themselves
// reading it (right). On generate, the paragraph is split into sentences so
// each renders pinyin-on-top + English (same display as Text Assignment) and
// stays readable. Both the entry and a recording are required to submit; the
// submission goes to a Diary Reviewer.
// ---------------------------------------------------------------------------

interface DiaryLine {
  chineseText: string;
  pinyin: string;
  english: string;
}

export interface DiarySubmissionDto {
  id: string;
  status: string;
  submittedAt: string | null;
  lines: DiaryLine[];
  hasRecording: boolean;
}

const LOCKED_STATUSES = new Set(["in_review", "reviewed"]);

/** Split a paragraph into sentences on line breaks and Chinese/ASCII enders. */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[。！？!?；;…])/))
    .map((s) => s.trim())
    .filter(Boolean);
}

export function DiaryViewer({
  lessonId,
  initialSubmission,
  lang = "mandarin",
}: {
  lessonId: string;
  initialSubmission: DiarySubmissionDto | null;
  lang?: "mandarin" | "cantonese";
}) {
  const [submission, setSubmission] = useState<DiarySubmissionDto | null>(
    initialSubmission,
  );
  const [lines, setLines] = useState<DiaryLine[] | null>(
    initialSubmission && initialSubmission.lines.length > 0
      ? initialSubmission.lines
      : null,
  );
  const [draft, setDraft] = useState(
    initialSubmission?.lines.map((l) => l.chineseText).join("") ?? "",
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  // Uploaded recording blob URL (for submit), and the URL to play back.
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const locked = submission ? LOCKED_STATUSES.has(submission.status) : false;
  const existingPlayback =
    submission?.hasRecording && submission.id
      ? `/api/course-library/submission-recording/${submission.id}`
      : null;

  const handleGenerate = async () => {
    const parts = splitIntoSentences(draft);
    if (parts.length === 0) return;
    setGenerating(true);
    setGenError(null);
    try {
      const annotations = await Promise.all(
        parts.map((p) => generateAnnotation(p, lang)),
      );
      setLines(
        parts.map((p, i) => ({
          chineseText: p,
          pinyin: annotations[i].pinyin,
          english: annotations[i].english,
        })),
      );
    } catch {
      setGenError(
        "Could not generate pinyin and translation. Press Enter to try again.",
      );
    } finally {
      setGenerating(false);
    }
  };

  const handleEdit = () => {
    if (locked) return;
    setLines(null);
  };

  const canSubmit =
    !locked &&
    !submitting &&
    !generating &&
    lines !== null &&
    lines.length > 0 &&
    (recordingUrl !== null || existingPlayback !== null);

  const isResubmit =
    !!submission && !locked && submission.status !== "reviewed";

  const handleSubmit = async () => {
    if (lines === null || lines.length === 0) {
      setError("Write your diary entry and press Enter to generate it first.");
      return;
    }
    if (!recordingUrl && !existingPlayback) {
      setError("Please record yourself reading your diary before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/course-library/lessons/${lessonId}/diary-submission`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: lines.map((l) => ({
              chineseText: l.chineseText,
              pinyin: l.pinyin,
              english: l.english,
            })),
            // Reuse the existing recording on resubmit if no new one was made.
            audioUrl: recordingUrl ?? undefined,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (res.status === 409) {
          setSubmission((prev) =>
            prev ? { ...prev, status: "in_review" } : prev,
          );
        }
        setError(data?.error || "Failed to submit");
        return;
      }
      const sub = data.submission;
      setSubmission({
        id: sub.id,
        status: sub.status,
        submittedAt: sub.submittedAt,
        lines,
        hasRecording: true,
      });
      toast.success(isResubmit ? "Diary resubmitted!" : "Diary submitted!", {
        description:
          "You'll receive personalised feedback from our coaching team very soon.",
      });
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
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
                Your diary has been reviewed.{" "}
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
                You&apos;ll receive personalised feedback from our coaching team
                very soon. You can still edit and resubmit until it has been
                reviewed.
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.8fr_1fr]">
        {/* Left: diary entry */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Your diary entry
          </h3>
          {lines !== null ? (
            <div className="rounded-md border border-border bg-card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-3">
                  {lines.map((line, i) => (
                    <div key={i} className="space-y-0.5">
                      {lang === "cantonese" ? (
                        <ModelAnnotatedSentence
                          chinese={line.chineseText}
                          pinyin={line.pinyin}
                          fontSize={DIARY_CHAR_SIZE}
                          className="text-foreground"
                          lang="cantonese"
                        />
                      ) : (
                        <AnnotatedSentence
                          text={line.chineseText}
                          fontSize={DIARY_CHAR_SIZE}
                          className="text-foreground"
                        />
                      )}
                      {line.english && (
                        <p
                          className="text-muted-foreground italic"
                          style={{ fontSize: `${DIARY_ENGLISH_SIZE}px` }}
                        >
                          {line.english}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {!locked && (
                  <button
                    type="button"
                    onClick={handleEdit}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    <Pencil className="w-3 h-3" />
                    Edit
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder="Write your diary entry in Chinese here. Use punctuation (。！？) between sentences, then press Enter to generate pinyin + English."
                disabled={submitting || generating}
                rows={10}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground/60 resize-y disabled:opacity-60"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Press{" "}
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-foreground">
                    Enter
                  </kbd>{" "}
                  to generate (Shift+Enter for a new line).
                </p>
                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={generating || !draft.trim() || submitting}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {generating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    "Generate"
                  )}
                </button>
              </div>
              {genError && <p className="text-sm text-red-500">{genError}</p>}
            </div>
          )}
        </div>

        {/* Right: recording */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">
            Read it aloud
          </h3>
          {locked ? (
            existingPlayback && (
               
              <audio
                controls
                preload="none"
                controlsList="nodownload"
                onContextMenu={(e) => e.preventDefault()}
                src={existingPlayback}
                className="w-full"
              />
            )
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Record yourself reading your diary (up to 5 minutes). You can
                listen back and re-record before submitting.
              </p>
              <AudioRecorder
                existingUrl={existingPlayback}
                allowFileUpload
                maxSeconds={300}
                onUpload={(url) => setRecordingUrl(url)}
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </div>
      )}

      {!locked && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isResubmit ? "Resubmit Diary" : "Submit Diary"}
          </button>
          {!canSubmit && !submitting && (
            <p className="text-xs text-muted-foreground">
              Generate your written entry and record yourself reading it before
              submitting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
