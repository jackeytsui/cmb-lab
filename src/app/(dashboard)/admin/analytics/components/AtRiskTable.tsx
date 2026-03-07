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
  if (days === null) return "text-red-400";
  if (days > 14) return "text-red-400";
  if (days >= 7) return "text-yellow-400";
  return "text-zinc-300";
}

function formatLastActivity(iso: string | null, days: number | null): string {
  if (!iso || days === null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return `${Math.floor(days / 7)} week ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  // Show absolute date for > 30 days
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
        <tr key={i} className="border-b border-zinc-700">
          <td className="px-4 py-3"><Skeleton className="h-4 w-28 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-36 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-20 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
          <td className="px-4 py-3"><Skeleton className="h-4 w-10 bg-zinc-700" /></td>
        </tr>
      ))}
    </>
  );
}

export function AtRiskTable({ data, loading }: AtRiskTableProps) {
  if (!loading && data.length === 0) {
    return (
      <p className="rounded-lg border border-zinc-700 bg-zinc-800 p-6 text-center text-zinc-500">
        No at-risk students found
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-700">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-zinc-800 text-left text-zinc-400">
          <tr className="border-b border-zinc-700">
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
                className="border-b border-zinc-700/50 bg-zinc-800/50 hover:bg-zinc-800"
              >
                <td className="px-4 py-3 text-white">
                  {row.name || "Unknown"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {row.email || "-"}
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  {formatLastActivity(row.lastActivity, row.daysSinceActivity)}
                </td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${daysColor(row.daysSinceActivity)}`}>
                    {row.daysSinceActivity !== null ? row.daysSinceActivity : "-"}
                  </span>
                </td>
                <td className="px-4 py-3 text-zinc-300">
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
