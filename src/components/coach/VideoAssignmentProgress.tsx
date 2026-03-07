"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Clock, MinusCircle } from "lucide-react";
import {
  type VideoAssignmentProgressResult,
  type StudentVideoProgress,
  COMPLETION_THRESHOLD,
} from "@/types/video";

interface VideoAssignmentProgressProps {
  data: VideoAssignmentProgressResult;
}

/**
 * Format milliseconds to human-readable time (e.g. "1h 23m" or "5m 12s")
 */
function formatWatchTime(ms: number): string {
  if (ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Get status for a student's progress
 */
function getStatus(student: StudentVideoProgress): "completed" | "in-progress" | "not-started" {
  if (student.completionPercent >= COMPLETION_THRESHOLD) return "completed";
  if (student.completionPercent > 0 || student.totalWatchedMs > 0) return "in-progress";
  return "not-started";
}

/**
 * Sort students: completed first, then in-progress by %, then not started.
 * Alphabetical within groups.
 */
function sortStudents(students: StudentVideoProgress[]): StudentVideoProgress[] {
  return [...students].sort((a, b) => {
    const statusA = getStatus(a);
    const statusB = getStatus(b);

    const statusOrder = { completed: 0, "in-progress": 1, "not-started": 2 };
    if (statusOrder[statusA] !== statusOrder[statusB]) {
      return statusOrder[statusA] - statusOrder[statusB];
    }

    // Within same status group, sort by completion % desc, then name
    if (statusA === "in-progress" && a.completionPercent !== b.completionPercent) {
      return b.completionPercent - a.completionPercent;
    }

    const nameA = (a.studentName || a.studentEmail).toLowerCase();
    const nameB = (b.studentName || b.studentEmail).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function VideoAssignmentProgress({ data }: VideoAssignmentProgressProps) {
  const sorted = sortStudents(data.students);

  const completedCount = sorted.filter((s) => getStatus(s) === "completed").length;
  const inProgressCount = sorted.filter((s) => getStatus(s) === "in-progress").length;
  const notStartedCount = sorted.filter((s) => getStatus(s) === "not-started").length;

  return (
    <div>
      {/* Summary bar */}
      <div className="flex items-center gap-6 mb-6 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-white">{sorted.length}</p>
          <p className="text-xs text-zinc-500">Total Students</p>
        </div>
        <div className="h-8 w-px bg-zinc-700" />
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
          <p className="text-xs text-zinc-500">Completed</p>
        </div>
        <div className="h-8 w-px bg-zinc-700" />
        <div className="text-center">
          <p className="text-2xl font-bold text-yellow-400">{inProgressCount}</p>
          <p className="text-xs text-zinc-500">In Progress</p>
        </div>
        <div className="h-8 w-px bg-zinc-700" />
        <div className="text-center">
          <p className="text-2xl font-bold text-zinc-400">{notStartedCount}</p>
          <p className="text-xs text-zinc-500">Not Started</p>
        </div>
      </div>

      {/* Table */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          No students assigned to this video.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Student</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Completion</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Time Watched</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Last Watched</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((student) => {
                const status = getStatus(student);
                return (
                  <tr
                    key={student.studentId}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30"
                  >
                    {/* Student name */}
                    <td className="py-3 px-4">
                      <p className="font-medium text-white">
                        {student.studentName || student.studentEmail}
                      </p>
                      {student.studentName && (
                        <p className="text-xs text-zinc-500">{student.studentEmail}</p>
                      )}
                    </td>

                    {/* Completion % */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-sm ${
                            status === "completed"
                              ? "text-emerald-400"
                              : status === "in-progress"
                                ? "text-yellow-400"
                                : "text-zinc-500"
                          }`}
                        >
                          {student.completionPercent}%
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              status === "completed"
                                ? "bg-emerald-500"
                                : status === "in-progress"
                                  ? "bg-yellow-500"
                                  : "bg-zinc-600"
                            }`}
                            style={{ width: `${Math.min(student.completionPercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Time watched */}
                    <td className="py-3 px-4 text-zinc-300">
                      {formatWatchTime(student.totalWatchedMs)}
                    </td>

                    {/* Last watched */}
                    <td className="py-3 px-4 text-zinc-400">
                      {student.lastWatched
                        ? formatDistanceToNow(new Date(student.lastWatched), {
                            addSuffix: true,
                          })
                        : "Never"}
                    </td>

                    {/* Status badge */}
                    <td className="py-3 px-4">
                      {status === "completed" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-xs text-emerald-300 border border-emerald-700">
                          <CheckCircle className="h-3 w-3" />
                          Completed
                        </span>
                      ) : status === "in-progress" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-yellow-900/50 px-2.5 py-0.5 text-xs text-yellow-300 border border-yellow-700">
                          <Clock className="h-3 w-3" />
                          In Progress
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400 border border-zinc-700">
                          <MinusCircle className="h-3 w-3" />
                          Not Started
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
