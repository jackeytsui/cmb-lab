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
  if (rate > 50) return "text-red-500";
  if (rate >= 25) return "text-yellow-500";
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
          <td className="px-4 py-3"><Skeleton className="h-4 w-14" /></td>
        </tr>
      ))}
    </>
  );
}

export function DropoffTable({ data, loading }: DropoffTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No drop-off data available
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
                className="border-b border-border/50 hover:bg-accent/50"
              >
                <td className="px-4 py-3 text-foreground">{row.lessonTitle}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.courseTitle} &gt; {row.moduleTitle}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{row.startedCount}</td>
                <td className="px-4 py-3 text-muted-foreground">{row.completedCount}</td>
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
