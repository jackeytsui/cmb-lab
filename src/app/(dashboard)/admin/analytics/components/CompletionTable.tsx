"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { CompletionRow } from "@/lib/admin-analytics-model";

interface CompletionTableProps {
  data: CompletionRow[];
  loading: boolean;
}

function rateColor(rate: number): string {
  if (rate >= 70) return "bg-green-500";
  if (rate >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function rateTextColor(rate: number): string {
  if (rate >= 70) return "text-green-500";
  if (rate >= 40) return "text-yellow-500";
  return "text-red-500";
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-32" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-10" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-10" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-10" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-10" />
          </td>
          <td className="px-4 py-3">
            <Skeleton className="h-4 w-24" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function CompletionTable({ data, loading }: CompletionTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No course data available
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/40 text-left text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-3 font-medium">Course</th>
              <th className="px-4 py-3 font-medium">Lessons</th>
              <th className="px-4 py-3 font-medium">Course Accesses</th>
              <th className="px-4 py-3 font-medium">Active in Period</th>
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
                  className={`border-b border-border/50 hover:bg-accent/50 ${
                    row.rowType === "customized_aggregate"
                      ? "bg-primary/[0.04]"
                      : ""
                  }`}
                >
                  <td className="px-4 py-3 text-foreground">
                    <div className="font-medium">{row.courseTitle}</div>
                    {row.rowType === "customized_aggregate" && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {row.courseCount} courses summarized
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.totalLessons}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.enrolledStudents}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.activeStudents}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.completedStudents}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${rateColor(
                            row.completionRate
                          )}`}
                          style={{
                            width: `${Math.min(row.completionRate, 100)}%`,
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-medium ${rateTextColor(
                          row.completionRate
                        )}`}
                      >
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
      <p className="mt-2 text-xs text-muted-foreground">
        Completion is a snapshot as of the selected end date. Activity uses the
        selected period and excludes bulk migration syncs. The customized row
        totals course accesses, so one student may count more than once when
        assigned multiple custom courses.
      </p>
    </div>
  );
}
