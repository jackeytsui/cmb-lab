"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface DropoffTableProps {
  data: Array<{
    lessonId: string;
    lessonTitle: string;
    moduleTitle: string;
    courseTitle: string;
    startedCount: number;
    completedCount: number;
    dropoffCount: number;
    dropoffRate: number;
  }>;
  loading: boolean;
}

function rateTextColor(rate: number): string {
  if (rate > 50) return "text-red-400";
  if (rate >= 25) return "text-yellow-400";
  return "text-green-400";
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-zinc-700">
          <td className="px-4 py-3"><Skeleton className="h-4 w-32 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-40 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-14 bg-zinc-700" /></td>
        </tr>
      ))}
    </>
  );
}

export function DropoffTable({ data, loading }: DropoffTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center text-zinc-500">
        No drop-off data available
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400">
          <tr className="border-b border-zinc-700">
            <th className="px-4 py-3 font-medium">Lesson</th>
            <th className="px-4 py-3 font-medium">Course &gt; Module</th>
            <th className="px-4 py-3 font-medium">Started</th>
            <th className="px-4 py-3 font-medium">Completed</th>
            <th className="px-4 py-3 font-medium">Drop-off Rate</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : (
            data.map((row) => (
              <tr
                key={row.lessonId}
                className="border-b border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800"
              >
                <td className="px-4 py-3 text-white">{row.lessonTitle}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {row.courseTitle} &gt; {row.moduleTitle}
                </td>
                <td className="px-4 py-3 text-zinc-300">{row.startedCount}</td>
                <td className="px-4 py-3 text-zinc-300">{row.completedCount}</td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${rateTextColor(row.dropoffRate)}`}>
                    {row.dropoffRate}%
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
