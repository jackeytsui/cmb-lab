"use client";

import { useState } from "react";
import { Check, X, Loader2, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

// Sanitized quiz content — correctOptionIds is stripped before reaching the client.
interface PublicQuestion {
  id: string;
  prompt: string;
  type: "single" | "multiple" | "true_false";
  options: Array<{ id: string; text: string }>;
  points: number;
}

interface PublicQuizContent {
  description?: string;
  passingScore: number;
  questions: PublicQuestion[];
}

interface GradeResult {
  score: number;
  passed: boolean;
  passingScore: number;
  earned: number;
  total: number;
  perQuestion: Array<{
    questionId: string;
    correct: boolean;
    pointsEarned: number;
    points: number;
    correctOptionIds: string[];
    explanation?: string;
  }>;
}

export function QuizLessonViewer({
  lessonId,
  quiz,
}: {
  lessonId: string;
  quiz: PublicQuizContent;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickSingle = (qId: string, optId: string) => {
    setAnswers((prev) => ({ ...prev, [qId]: [optId] }));
  };
  const toggleMultiple = (qId: string, optId: string) => {
    setAnswers((prev) => {
      const cur = prev[qId] ?? [];
      const next = cur.includes(optId)
        ? cur.filter((id) => id !== optId)
        : [...cur, optId];
      return { ...prev, [qId]: next };
    });
  };

  const canSubmit =
    quiz.questions.length > 0 &&
    quiz.questions.every((q) => (answers[q.id]?.length ?? 0) > 0);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/course-library/lessons/${lessonId}/grade-quiz`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Failed to submit quiz");
        return;
      }
      const data = (await res.json()) as GradeResult;
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = () => {
    setAnswers({});
    setResult(null);
    setError(null);
  };

  // Results view
  if (result) {
    return (
      <div className="space-y-4">
        <div
          className={cn(
            "rounded-lg border p-6",
            result.passed
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-amber-500/30 bg-amber-500/10",
          )}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p
                className={cn(
                  "text-2xl font-bold",
                  result.passed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
                )}
              >
                {result.score}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {result.passed ? "Passed" : "Not yet passed"} · Passing score:{" "}
                {result.passingScore}%
              </p>
              <p className="text-[10px] text-muted-foreground">
                {result.earned} of {result.total} points
              </p>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {quiz.questions.map((q, idx) => {
            const res = result.perQuestion.find((r) => r.questionId === q.id);
            const given = answers[q.id] ?? [];
            if (!res) return null;
            return (
              <div
                key={q.id}
                className={cn(
                  "rounded-lg border bg-card p-4",
                  res.correct
                    ? "border-emerald-500/30"
                    : "border-red-500/30",
                )}
              >
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground mt-0.5">
                    Q{idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {q.prompt}
                    </p>
                  </div>
                  {res.correct ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500">
                      <Check className="w-3.5 h-3.5" />
                      Correct
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-500">
                      <X className="w-3.5 h-3.5" />
                      Incorrect
                    </span>
                  )}
                </div>
                <div className="space-y-1.5 ml-6">
                  {q.options.map((opt) => {
                    const isCorrect = res.correctOptionIds.includes(opt.id);
                    const wasSelected = given.includes(opt.id);
                    return (
                      <div
                        key={opt.id}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                          isCorrect
                            ? "border-emerald-500/40 bg-emerald-500/5"
                            : wasSelected
                              ? "border-red-500/40 bg-red-500/5"
                              : "border-border bg-background",
                        )}
                      >
                        {isCorrect ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                        ) : wasSelected ? (
                          <X className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        ) : (
                          <span className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "flex-1",
                            isCorrect && "text-emerald-600 dark:text-emerald-400 font-medium",
                            wasSelected && !isCorrect && "text-red-600 dark:text-red-400",
                          )}
                        >
                          {opt.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {res.explanation && (
                  <p className="mt-3 ml-6 text-xs text-muted-foreground italic border-l-2 border-border pl-3">
                    {res.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Quiz-taking view
  return (
    <div className="space-y-4">
      {quiz.description && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {quiz.description}
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Passing score: {quiz.passingScore}% · {quiz.questions.length} question
        {quiz.questions.length === 1 ? "" : "s"}
      </p>

      {quiz.questions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            This quiz has no questions yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {quiz.questions.map((q, idx) => {
            const given = answers[q.id] ?? [];
            return (
              <div
                key={q.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-2 mb-3">
                  <span className="text-xs font-semibold text-muted-foreground mt-0.5">
                    Q{idx + 1}
                  </span>
                  <p className="flex-1 text-sm text-foreground whitespace-pre-wrap">
                    {q.prompt}
                  </p>
                </div>
                <div className="space-y-1.5 ml-6">
                  {q.options.map((opt) => {
                    const selected = given.includes(opt.id);
                    const multi = q.type === "multiple";
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          if (multi) toggleMultiple(q.id, opt.id);
                          else pickSingle(q.id, opt.id);
                        }}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-md border px-3 py-2 text-sm text-left transition-colors",
                          selected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background hover:border-primary/40",
                        )}
                      >
                        <span
                          className={cn(
                            "flex items-center justify-center w-5 h-5 shrink-0 border transition-colors",
                            multi ? "rounded" : "rounded-full",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border",
                          )}
                        >
                          {selected && <Check className="w-3 h-3" />}
                        </span>
                        {opt.text}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || !canSubmit}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          Submit quiz
        </button>
      </div>
    </div>
  );
}
