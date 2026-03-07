"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface CompletionTableProps {
  data: Array<{
    courseId: string;
    courseTitle: string;
    totalLessons: number;
    enrolledStudents: number;
    completedStudents: number;
    completionRate: number;
  }>;
  loading: boolean;
}

function rateColor(rate: number): string {
  if (rate >= 70) return "bg-green-500";
  if (rate >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function rateTextColor(rate: number): string {
  if (rate >= 70) return "text-green-400";
  if (rate >= 40) return "text-yellow-400";
  return "text-red-400";
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-zinc-700">
          <td className="px-4 py-3"><Skeleton className="h-4 w-32 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-24 bg-zinc-700" /></td>
        </tr>
      ))}
    </>
  );
}

export function CompletionTable({ data, loading }: CompletionTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center text-zinc-500">
        No course data available
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400">
          <tr className="border-b border-zinc-700">
            <th className="px-4 py-3 font-medium">Course</th>
            <th className="px-4 py-3 font-medium">Lessons</th>
            <th className="px-4 py-3 font-medium">Enrolled</th>
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">Completion Rate</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : (
            data.map((row) => (
              <tr
                key={row.courseId}
                className="border-b border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800"
              >
                <td className="px-4 py-3 text-white">{row.courseTitle}</td>
                <td className="px-4 py-3 text-zinc-300">{row.totalLessons}</td>
                <td className="px-4 py-3 text-zinc-300">{row.enrolledStudents}</td>
                <td className="px-4 py-3 text-zinc-300">{row.completedStudents}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className={`h-full rounded-full ${rateColor(row.completionRate)}`}
                        style={{ width: `${Math.min(row.completionRate, 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-medium ${rateTextColor(row.completionRate)}`}>
                      {row.completionRate}%
                    </span>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
