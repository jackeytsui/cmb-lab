"use client";

import { Skeleton } from "@/components/ui/skeleton";

interface AtRiskTableProps {
  data: Array<{
    userId: string;
    name: string | null;
    email: string | null;
    lastActivity: string | null;
    daysSinceActivity: number | null;
    totalLessonsCompleted: number;
  }>;
  loading: boolean;
}

function daysColor(days: number | null): string {
  if (days === null) return "text-red-500";
  if (days > 14) return "text-red-500";
  if (days >= 7) return "text-yellow-500";
  return "text-muted-foreground";
}

function formatLastActivity(iso: string | null, days: number | null): string {
  if (!iso || days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return `${Math.floor(days / 7)} week ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SkeletonRows() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <tr key={i} className="border-b border-border">
          <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
        </tr>
      ))}
    </>
  );
}

export function AtRiskTable({ data, loading }: AtRiskTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        No at-risk students found
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/40 text-left text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-3 font-medium">Student</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Last Activity</th>
            <th className="px-4 py-3 font-medium">Days Inactive</th>
            <th className="px-4 py-3 font-medium">Lessons Completed</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows />
          ) : (
            data.map((row) => (
              <tr
                key={row.userId}
                className="border-b border-border/50 hover:bg-accent/50"
              >
                <td className="px-4 py-3 text-foreground">
                  {row.name || "Unknown"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.email || "-"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {formatLastActivity(row.lastActivity, row.daysSinceActivity)}
                </td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${daysColor(row.daysSinceActivity)}`}>
                    {row.daysSinceActivity !== null ? row.daysSinceActivity : "-"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {row.totalLessonsCompleted}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
