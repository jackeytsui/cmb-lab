"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface DifficultyTableProps {
  data: Array<{
    lessonId: string;
    lessonTitle: string;
    moduleTitle: string;
    courseTitle: string;
    interactionCount: number;
    avgAttemptsToPass: number;
  }>;
  loading: boolean;
}

function attemptsColor(avg: number): string {
  if (avg > 5) return "text-red-400";
  if (avg >= 3) return "text-yellow-400";
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
        </tr>
      ))}
    </>
  );
}

export function DifficultyTable({ data, loading }: DifficultyTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center text-zinc-500">
        No difficulty data available
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
            <th className="px-4 py-3 font-medium">Interactions</th>
            <th className="px-4 py-3 font-medium">Avg Attempts to Pass</th>
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
                <td className="px-4 py-3 text-zinc-300">{row.interactionCount}</td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${attemptsColor(row.avgAttemptsToPass)}`}>
                    {row.avgAttemptsToPass}
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
