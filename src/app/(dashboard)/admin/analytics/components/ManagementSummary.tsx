"use client";

import {
  Activity,
  CircleAlert,
  GraduationCap,
  MousePointerClick,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CompletionRow } from "@/lib/admin-analytics-model";

type Overview = {
  activeStudents: number;
  totalStudents: number;
  inactiveStudentsLoggedInOnce: number;
  inactiveStudentsNeverLoggedIn: number;
};

type Engagement = {
  activeStudents: number;
  avgActiveMinutesPerActiveStudent: number;
  topFeature: string | null;
};

type Dropoff = {
  lessonTitle: string;
  courseTitle: string;
  startedCount: number;
  dropoffCount: number;
  dropoffRate: number;
};

type ManagementSummaryProps = {
  overview: Overview;
  engagement: Engagement;
  completion: CompletionRow[];
  dropoff: Dropoff[];
  atRiskCount: number;
  loading: boolean;
};

function percent(numerator: number, denominator: number): number {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : 0;
}

export function ManagementSummary({
  overview,
  engagement,
  completion,
  dropoff,
  atRiskCount,
  loading,
}: ManagementSummaryProps) {
  const courseAccesses = completion.reduce(
    (sum, row) => sum + row.enrolledStudents,
    0
  );
  const activeCourseAccesses = completion.reduce(
    (sum, row) => sum + row.activeStudents,
    0
  );
  const completedCourseAccesses = completion.reduce(
    (sum, row) => sum + row.completedStudents,
    0
  );
  const topDropoff = dropoff[0] ?? null;

  const cards = [
    {
      label: "Student activation",
      value: `${percent(overview.activeStudents, overview.totalStudents)}%`,
      detail: `${overview.activeStudents} of ${overview.totalStudents} active in the selected period`,
      icon: Activity,
      tone: "text-emerald-500 bg-emerald-500/10",
    },
    {
      label: "Course engagement",
      value: activeCourseAccesses.toLocaleString(),
      detail: `${percent(
        activeCourseAccesses,
        courseAccesses
      )}% of course accesses active in the period`,
      icon: MousePointerClick,
      tone: "text-blue-500 bg-blue-500/10",
    },
    {
      label: "Course completion",
      value: `${percent(completedCourseAccesses, courseAccesses)}%`,
      detail: `${completedCourseAccesses} of ${courseAccesses} course accesses completed`,
      icon: GraduationCap,
      tone: "text-violet-500 bg-violet-500/10",
    },
    {
      label: "Students needing attention",
      value: atRiskCount.toLocaleString(),
      detail: "No activity yet or inactive for at least 7 days",
      icon: CircleAlert,
      tone: "text-amber-500 bg-amber-500/10",
    },
  ];

  return (
    <section aria-labelledby="management-summary-heading">
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Management snapshot
        </p>
        <h2
          id="management-summary-heading"
          className="mt-1 text-xl font-semibold text-foreground"
        >
          Student health at a glance
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Activation, learning momentum, completion, and the areas that need
          follow-up.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <span className={`rounded-lg p-2 ${card.tone}`}>
                <card.icon className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>
            {loading ? (
              <>
                <Skeleton className="mt-4 h-9 w-20" />
                <Skeleton className="mt-2 h-4 w-full" />
              </>
            ) : (
              <>
                <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">
                  {card.value}
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {card.detail}
                </p>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Onboarding follow-up
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {loading ? "—" : overview.inactiveStudentsNeverLoggedIn} with no CMB
            Lab activity
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Prioritize login and setup support for this group.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Largest lesson drop-off
          </p>
          <p className="mt-2 line-clamp-1 text-lg font-semibold text-foreground">
            {loading ? "—" : topDropoff?.lessonTitle ?? "Not enough data yet"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {topDropoff
              ? `${topDropoff.dropoffRate}% (${topDropoff.dropoffCount} of ${topDropoff.startedCount}) · ${topDropoff.courseTitle}`
              : "Drop-off points appear after at least three students start a lesson."}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Most-used learning tool
          </p>
          <p className="mt-2 text-lg font-semibold text-foreground">
            {loading ? "—" : engagement.topFeature ?? "Not enough data yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {engagement.activeStudents} students used tracked tools, averaging{" "}
            {engagement.avgActiveMinutesPerActiveStudent} active minutes each.
          </p>
        </div>
      </div>
    </section>
  );
}
