"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, XCircle, RotateCcw, ArrowRight, Mic, Brain, Check } from "lucide-react";
import type { PracticeSet, PracticeExercise } from "@/db/schema/practice";
import type { GradeResult } from "@/lib/practice-grading";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Props
// ============================================================

interface PracticeResultsProps {
  practiceSet: PracticeSet;
  exercises: PracticeExercise[];
  results: Record<string, GradeResult>;
  responses: Record<string, unknown>;
  startedAt: Date | null;
  completedAt: Date | null;
  onRetryAll: () => void;
  onRetryExercise: (exerciseId: string) => void;
  nextAction?: { label: string; href: string };
}

// ============================================================
// Helpers
// ============================================================

/**
 * Extract a human-readable question text from an exercise definition.
 * Each exercise type stores its "question" in a different field.
 */
function getQuestionText(def: ExerciseDefinition): string {
  switch (def.type) {
    case "multiple_choice":
      return def.question;
    case "fill_in_blank":
      return def.sentence;
    case "matching":
      return `Match ${def.pairs.length} pairs`;
    case "ordering":
      return `Order ${def.items.length} items`;
    case "audio_recording":
      return def.targetPhrase;
    case "free_text":
      return def.prompt;
    default:
      return "Exercise";
  }
}

/** Format a time duration (ms) into "Xm Ys" */
function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt || !completedAt) return "--";
  const diffMs = completedAt.getTime() - startedAt.getTime();
  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

/** Capitalize and format exercise type for display */
function formatExerciseType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ============================================================
// PracticeResults
// ============================================================

export function PracticeResults({
  exercises,
  results,
  startedAt,
  completedAt,
  onRetryAll,
  onRetryExercise,
  nextAction,
}: PracticeResultsProps) {
  const router = useRouter();
  const [addingToSrsId, setAddingToSrsId] = useState<string | null>(null);
  const [addedToSrsIds, setAddedToSrsIds] = useState<Set<string>>(new Set());

  // Compute overall score
  const { totalCorrect, overallScore } = useMemo(() => {
    const resultValues = Object.values(results);
    const correct = resultValues.filter((r) => r.isCorrect).length;
    const score =
      resultValues.length > 0
        ? Math.round(
            resultValues.reduce((acc, r) => acc + r.score, 0) /
              resultValues.length
          )
        : 0;
    return { totalCorrect: correct, overallScore: score };
  }, [results]);

  // Score color
  const scoreColor =
    overallScore >= 80
      ? "text-green-400"
      : overallScore >= 60
        ? "text-yellow-400"
        : "text-red-400";

  const scoreBgColor =
    overallScore >= 80
      ? "bg-green-500/20 border-green-500/50"
      : overallScore >= 60
        ? "bg-yellow-500/20 border-yellow-500/50"
        : "bg-red-500/20 border-red-500/50";

  async function addMissedToSrs(exercise: PracticeExercise, result: GradeResult | undefined) {
    if (!result || result.isCorrect) return;
    const definition = exercise.definition as ExerciseDefinition;
    const front = getQuestionText(definition);
    const meaning = result.feedback || "Review missed practice item";

    setAddingToSrsId(exercise.id);
    try {
      const res = await fetch("/api/srs/cards/from-vocabulary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          traditional: front,
          simplified: front,
          meaning,
          sourceType: "practice",
          example: result.explanation ?? undefined,
        }),
      });

      if (res.ok) {
        setAddedToSrsIds((prev) => {
          const next = new Set(prev);
          next.add(exercise.id);
          return next;
        });
      }
    } finally {
      setAddingToSrsId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Score card */}
      <div
        className={`p-6 rounded-xl border text-center ${scoreBgColor}`}
      >
        <p className={`text-5xl font-bold ${scoreColor}`}>
          {overallScore}%
        </p>
        <p className="text-zinc-300 mt-2">
          {totalCorrect} of {exercises.length} correct
        </p>
        <p className="text-zinc-500 text-sm mt-1">
          Time: {formatDuration(startedAt, completedAt)}
        </p>
      </div>

      {/* Per-question breakdown */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-white">Breakdown</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {exercises.map((exercise, index) => {
            const result = results[exercise.id];
            const def = exercise.definition as ExerciseDefinition;
            const questionText = getQuestionText(def);
            const truncated =
              questionText.length > 80
                ? questionText.slice(0, 80) + "..."
                : questionText;

            return (
              <div
                key={exercise.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700/50"
              >
                {/* Exercise number */}
                <span className="text-zinc-500 text-sm font-mono w-6 shrink-0">
                  {index + 1}
                </span>

                {/* Type badge */}
                <span className="text-xs px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 shrink-0">
                  {formatExerciseType(exercise.type)}
                </span>

                {/* Question text */}
                <span className="text-zinc-300 text-sm flex-1 truncate">
                  {truncated}
                </span>

                {/* Score indicator */}
                {result ? (
                  <div className="flex items-center gap-2 shrink-0">
                    {result.isCorrect ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-red-500" />
                        <button
                          type="button"
                          onClick={() => onRetryExercise(exercise.id)}
                          className="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors flex items-center gap-1"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => addMissedToSrs(exercise, result)}
                          disabled={addingToSrsId === exercise.id || addedToSrsIds.has(exercise.id)}
                          className="text-xs px-2 py-1 rounded bg-cyan-900/40 hover:bg-cyan-800/40 text-cyan-200 transition-colors flex items-center gap-1 disabled:opacity-60"
                        >
                          {addedToSrsIds.has(exercise.id) ? (
                            <>
                              <Check className="h-3 w-3" />
                              Added
                            </>
                          ) : (
                            <>
                              <Brain className="h-3 w-3" />
                              Add to SRS
                            </>
                          )}
                        </button>
                      </>
                    )}
                    <span
                      className={`text-xs font-mono ${
                        result.isCorrect ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {result.score}
                    </span>
                    {result.pronunciationDetails && (
                      <span title="Pronunciation scored">
                        <Mic className="h-3.5 w-3.5 text-cyan-400" />
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-zinc-600 text-xs">--</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onRetryAll}
          className="flex-1 px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Retry All
        </button>
        <button
          type="button"
          onClick={() => router.push(nextAction?.href || "/dashboard")}
          className="flex-1 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center justify-center gap-2"
        >
          {nextAction ? nextAction.label : "Done"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
