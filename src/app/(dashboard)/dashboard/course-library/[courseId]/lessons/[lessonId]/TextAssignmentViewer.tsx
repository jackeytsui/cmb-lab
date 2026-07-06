"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MandarinSentenceInput,
  type MandarinSentenceValue,
} from "@/components/assignments/MandarinSentenceInput";

export interface TextAssignmentPrompt {
  id: string;
  label: string;
  description: string;
}

export interface TextAssignmentSubmissionDto {
  id: string;
  status: "draft" | "submitted" | "assigned" | "in_review" | "reviewed";
  submittedAt: string | null;
  finalScore: number | null;
  sentences: Array<{
    promptId: string;
    chineseText: string;
    generatedPinyin: string;
    generatedEnglish: string;
  }>;
}

// Editing is locked only once a reviewer actually starts (in_review) or
// finishes (reviewed). A submission is auto-assigned to a reviewer on submit,
// but "assigned" still lets the student edit/resubmit until review begins.
const LOCKED_STATUSES = new Set(["in_review", "reviewed"]);

function buildInitialValues(
  prompts: TextAssignmentPrompt[],
  submission: TextAssignmentSubmissionDto | null,
): Record<string, MandarinSentenceValue | null> {
  const values: Record<string, MandarinSentenceValue | null> = {};
  for (const prompt of prompts) {
    const sentence = submission?.sentences.find(
      (s) => s.promptId === prompt.id,
    );
    values[prompt.id] = sentence
      ? {
          chineseText: sentence.chineseText,
          pinyin: sentence.generatedPinyin,
          english: sentence.generatedEnglish,
        }
      : null;
  }
  return values;
}

export function TextAssignmentViewer({
  lessonId,
  prompts,
  initialSubmission,
}: {
  lessonId: string;
  prompts: TextAssignmentPrompt[];
  initialSubmission: TextAssignmentSubmissionDto | null;
}) {
  const [submission, setSubmission] = useState(initialSubmission);
  const [values, setValues] = useState(() =>
    buildInitialValues(prompts, initialSubmission),
  );
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  const locked = submission ? LOCKED_STATUSES.has(submission.status) : false;
  // Any prior, still-editable submission means the next action is a resubmit.
  const isResubmit = !!submission && !locked && submission.status !== "reviewed";

  const allReady = useMemo(
    () =>
      prompts.every((p) => values[p.id] !== null) &&
      !Object.values(generating).some(Boolean),
    [prompts, values, generating],
  );

  const handleSubmit = async () => {
    if (!allReady || submitting || locked) return;
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/course-library/lessons/${lessonId}/assignment-submission`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sentences: prompts.map((p) => {
              const value = values[p.id]!;
              return {
                promptId: p.id,
                chineseText: value.chineseText,
                pinyin: value.pinyin,
                english: value.english,
              };
            }),
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(data?.error || "Failed to submit assignment");
        if (res.status === 409 && data?.error) {
          // Review started while editing — reflect the lock.
          setSubmission((prev) =>
            prev ? { ...prev, status: "in_review" } : prev,
          );
        }
        return;
      }
      setSubmission(data.submission);
      toast.success(
        isResubmit ? "Assignment resubmitted!" : "Assignment submitted!",
        {
          description:
            "You'll receive personalised feedback from our coaching team very soon.",
        },
      );
    } catch {
      toast.error("Failed to submit assignment");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5">
      {submission && (
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
                Your submission has been reviewed
                {typeof submission.finalScore === "number" && (
                  <> — score {submission.finalScore}%</>
                )}
                .{" "}
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
                <span className="font-medium">Submitted!</span> You&apos;ll
                receive personalised feedback from our coaching team very soon.
                You can still edit and resubmit until it has been reviewed.
              </>
            )}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {prompts.map((prompt, idx) => (
          <div key={prompt.id} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">
                {idx + 1}
              </span>
              <div>
                <p className="text-base font-medium text-foreground">
                  {prompt.label || `Sentence ${idx + 1}`}
                </p>
                {prompt.description && (
                  <p className="text-base text-foreground">
                    {prompt.description}
                  </p>
                )}
              </div>
            </div>
            <MandarinSentenceInput
              value={values[prompt.id]}
              onValueChange={(value) =>
                setValues((prev) => ({ ...prev, [prompt.id]: value }))
              }
              onGeneratingChange={(g) =>
                setGenerating((prev) => ({ ...prev, [prompt.id]: g }))
              }
              disabled={submitting}
              readOnly={locked}
            />
          </div>
        ))}
      </div>

      {!locked && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!allReady || submitting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isResubmit ? "Resubmit Assignment" : "Submit Assignment"}
          </button>
          {!allReady && (
            <p className="text-xs text-muted-foreground">
              Complete every sentence box (press Enter to generate pinyin and
              English) before submitting.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
