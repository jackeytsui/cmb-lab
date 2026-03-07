"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import type { MasteryCourse } from "@/lib/progress-dashboard";

// ============================================================
// Helpers
// ============================================================

function pct(completed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

// ============================================================
// MasteryMap
// ============================================================

interface MasteryMapProps {
  data: MasteryCourse[];
}

export function MasteryMap({ data }: MasteryMapProps) {
  // Default expansion: all expanded if <= 3 courses, first only if > 3
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (data.length <= 3) {
      return new Set(data.map((c) => c.courseId));
    }
    return data.length > 0 ? new Set([data[0].courseId]) : new Set();
  });

  function toggleCourse(courseId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
      } else {
        next.add(courseId);
      }
      return next;
    });
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Mastery</h2>

      {data.length === 0 ? (
        <p className="text-zinc-500 text-center py-8">
          No courses enrolled yet
        </p>
      ) : (
        <div className="space-y-4">
          {data.map((course) => {
            const isExpanded = expanded.has(course.courseId);
            const percentage = pct(
              course.completedLessons,
              course.totalLessons
            );
            const isComplete = percentage === 100 && course.totalLessons > 0;

            return (
              <div key={course.courseId}>
                {/* Course header */}
                <button
                  type="button"
                  onClick={() => toggleCourse(course.courseId)}
                  className="w-full flex items-center gap-2 text-left group"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                  )}

                  <span className="text-sm font-medium text-white group-hover:text-zinc-200 truncate">
                    {course.courseTitle}
                  </span>

                  {isComplete && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  )}

                  <span className="ml-auto text-xs text-zinc-400 shrink-0">
                    {course.completedLessons}/{course.totalLessons} lessons
                    &middot; {percentage}%
                  </span>
                </button>

                {/* Course progress bar */}
                <div className="mt-1.5 ml-6 h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>

                {/* Module list (when expanded) */}
                {isExpanded && course.modules.length > 0 && (
                  <div className="mt-3 ml-6 space-y-2.5">
                    {course.modules.map((mod) => {
                      const modPct = pct(
                        mod.completedLessons,
                        mod.totalLessons
                      );
                      const modComplete =
                        modPct === 100 && mod.totalLessons > 0;

                      return (
                        <div key={mod.moduleId}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-zinc-300 truncate">
                              {mod.moduleTitle}
                            </span>
                            <span className="text-xs text-zinc-400 shrink-0 ml-2">
                              {mod.completedLessons}/{mod.totalLessons}
                            </span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-zinc-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                modComplete
                                  ? "bg-emerald-400"
                                  : "bg-emerald-500"
                              }`}
                              style={{ width: `${modPct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
