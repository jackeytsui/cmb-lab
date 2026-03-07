"use client";

import { Fragment, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ClipboardList,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AttemptDetail } from "@/lib/coach-practice";

interface PracticeAttemptTableProps {
  attempts: AttemptDetail[];
  loading: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "\u2014";
  if (seconds > 1800) return "30m+";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

const exerciseTypeBadgeColor: Record<string, string> = {
  multiple_choice: "bg-blue-500/20 text-blue-300",
  fill_in_blank: "bg-purple-500/20 text-purple-300",
  matching: "bg-cyan-500/20 text-cyan-300",
  tone_selection: "bg-amber-500/20 text-amber-300",
  pronunciation: "bg-pink-500/20 text-pink-300",
  listening: "bg-emerald-500/20 text-emerald-300",
  reorder: "bg-orange-500/20 text-orange-300",
};

function getTypeBadgeClasses(type: string): string {
  return (
    exerciseTypeBadgeColor[type] ?? "bg-zinc-500/20 text-zinc-300"
  );
}

export function PracticeAttemptTable({
  attempts,
  loading,
}: PracticeAttemptTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggleExpand(attemptId: string) {
    setExpandedId((prev) => (prev === attemptId ? null : attemptId));
  }

  // Loading state
  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400 border-b border-zinc-700">
            <tr>
              <th className="px-4 py-3 font-medium">Student</th>
              <th className="px-4 py-3 font-medium">Practice Set</th>
              <th className="px-4 py-3 font-medium">Score</th>
              <th className="px-4 py-3 font-medium">Correct</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <tr key={i} className="border-b border-zinc-800">
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-28 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-32 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-12 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-12 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-16 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-20 bg-zinc-800" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-5 bg-zinc-800" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Empty state
  if (attempts.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
          <ClipboardList className="w-8 h-8 text-zinc-600" />
        </div>
        <h3 className="text-lg font-medium text-zinc-300 mb-1">
          No practice attempts match your filters
        </h3>
        <p className="text-sm text-zinc-500">
          Try adjusting your filters or clearing them to see all results.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400 border-b border-zinc-700">
          <tr>
            <th className="px-4 py-3 font-medium">Student</th>
            <th className="px-4 py-3 font-medium">Practice Set</th>
            <th className="px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3 font-medium">Correct</th>
            <th className="px-4 py-3 font-medium">Time</th>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 w-10"></th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => {
            const isExpanded = expandedId === attempt.attemptId;
            return (
              <Fragment key={attempt.attemptId}>
                <tr
                  className="border-b border-zinc-800 hover:bg-zinc-800/50 cursor-pointer transition-colors"
                  onClick={() => toggleExpand(attempt.attemptId)}
                >
                  <td className="px-4 py-3 text-white">
                    {attempt.studentName || attempt.studentEmail}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {attempt.practiceSetTitle}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`font-bold ${scoreColor(attempt.score ?? 0)}`}
                    >
                      {attempt.score ?? "\u2014"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {attempt.correctCount}/{attempt.totalExercises}
                  </td>
                  <td className="px-4 py-3 text-zinc-300">
                    {formatTime(attempt.timeTakenSeconds)}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {attempt.completedAt
                      ? formatDistanceToNow(new Date(attempt.completedAt), {
                          addSuffix: true,
                        })
                      : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-zinc-500">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </td>
                </tr>
                {isExpanded && attempt.perExercise.length > 0 && (
                  <tr>
                    <td colSpan={7} className="bg-zinc-800/50 px-4 py-4">
                      <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">
                        Per-Exercise Breakdown
                      </div>
                      <div className="grid gap-2">
                        {attempt.perExercise.map((ex) => (
                          <div
                            key={ex.exerciseId}
                            className="flex items-center gap-3 rounded-md bg-zinc-900/50 px-3 py-2"
                          >
                            {/* Exercise type badge */}
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getTypeBadgeClasses(ex.exerciseType)}`}
                            >
                              {ex.exerciseType.replace(/_/g, " ")}
                            </span>

                            {/* Correct/incorrect icon */}
                            {ex.isCorrect ? (
                              <Check className="h-4 w-4 text-emerald-400" />
                            ) : (
                              <X className="h-4 w-4 text-red-400" />
                            )}

                            {/* Score */}
                            <span
                              className={`text-sm font-medium ${scoreColor(ex.score)}`}
                            >
                              {ex.score}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
