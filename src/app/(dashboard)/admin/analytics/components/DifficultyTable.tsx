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
  if (avg > 5) return "text-red-500";
  if (avg >= 3) return "text-yellow-500";
  return "text-green-500";
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
        </tr>
      ))}
    </>
  );
}

export function DifficultyTable({ data, loading }: DifficultyTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No difficulty data available
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/40 text-left text-muted-foreground">
          <tr className="border-b border-border">
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
                className="border-b border-border/50 hover:bg-accent/50"
              >
                <td className="px-4 py-3 text-foreground">{row.lessonTitle}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.courseTitle} &gt; {row.moduleTitle}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.interactionCount}</td>
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
