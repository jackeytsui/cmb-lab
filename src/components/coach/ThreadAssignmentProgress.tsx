"use client";

import { formatDistanceToNow } from "date-fns";
import { CheckCircle, Clock, MinusCircle } from "lucide-react";
import type {
  ThreadAssignmentProgressResult,
  StudentThreadProgress,
} from "@/lib/thread-assignments";

interface ThreadAssignmentProgressProps {
  data: ThreadAssignmentProgressResult;
}

/**
 * Sort students: completed first, then in-progress, then not-started.
 * Alphabetical within groups.
 */
function sortStudents(students: StudentThreadProgress[]): StudentThreadProgress[] {
  const statusOrder = { completed: 0, in_progress: 1, not_started: 2 };

  return [...students].sort((a, b) => {
    if (statusOrder[a.completionStatus] !== statusOrder[b.completionStatus]) {
      return statusOrder[a.completionStatus] - statusOrder[b.completionStatus];
    }

    const nameA = (a.studentName || a.studentEmail).toLowerCase();
    const nameB = (b.studentName || b.studentEmail).toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

export function ThreadAssignmentProgress({ data }: ThreadAssignmentProgressProps) {
  const sorted = sortStudents(data.students);

  const completedCount = sorted.filter((s) => s.completionStatus === "completed").length;
  const inProgressCount = sorted.filter((s) => s.completionStatus === "in_progress").length;
  const notStartedCount = sorted.filter((s) => s.completionStatus === "not_started").length;

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
          No students assigned to this thread.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50">
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Student</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Status</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Responses</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Started</th>
                <th className="py-3 px-4 text-left font-medium text-zinc-400">Completed</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((student) => (
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

                  {/* Status badge */}
                  <td className="py-3 px-4">
                    {student.completionStatus === "completed" ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/50 px-2.5 py-0.5 text-xs text-emerald-300 border border-emerald-700">
                        <CheckCircle className="h-3 w-3" />
                        Completed
                      </span>
                    ) : student.completionStatus === "in_progress" ? (
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

                  {/* Response count */}
                  <td className="py-3 px-4 text-zinc-300">
                    {student.responseCount}
                  </td>

                  {/* Started */}
                  <td className="py-3 px-4 text-zinc-400">
                    {student.startedAt
                      ? formatDistanceToNow(new Date(student.startedAt), {
                          addSuffix: true,
                        })
                      : "\u2014"}
                  </td>

                  {/* Completed */}
                  <td className="py-3 px-4 text-zinc-400">
                    {student.completedAt
                      ? formatDistanceToNow(new Date(student.completedAt), {
                          addSuffix: true,
                        })
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
