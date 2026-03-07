"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// ============================================================
// Types
// ============================================================

export interface WeekStats {
  totalXp: number;
  lessonsCompleted: number;
  practiceCompleted: number;
  daysActive: number;
  goalsMet: number;
}

interface WeeklySummaryProps {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  dayOfWeek: number; // 1-7 (Mon-Sun) for goal hit rate calculation
}

// ============================================================
// Sub-components
// ============================================================

/** Animated counter that counts up from 0 to target value on scroll into view */
function AnimatedCount({ value, suffix }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView || value === 0) {
      setDisplay(0);
      return;
    }

    const controls = animate(0, value, {
      duration: 1.2,
      ease: "easeOut",
      onUpdate(latest) {
        setDisplay(Math.round(latest));
      },
    });

    return () => controls.stop();
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

/** Delta indicator showing week-over-week change */
function DeltaIndicator({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  // Previous was zero and current has value: show "New"
  if (previous === 0 && current > 0) {
    return <span className="text-xs text-emerald-400">New</span>;
  }

  const diff = current - previous;

  if (diff > 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-emerald-400">
        <TrendingUp className="h-3 w-3" />
        +{diff}
      </span>
    );
  }

  if (diff < 0) {
    return (
      <span className="flex items-center gap-0.5 text-xs text-amber-400">
        <TrendingDown className="h-3 w-3" />
        {diff}
      </span>
    );
  }

  // Equal
  return (
    <span className="flex items-center gap-0.5 text-xs text-zinc-500">
      <Minus className="h-3 w-3" />
      —
    </span>
  );
}

/** Individual stat card within the summary grid */
function StatCard({
  label,
  current,
  previous,
  suffix,
}: {
  label: string;
  current: number;
  previous: number;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-800/50 p-4">
      <p className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <p className="text-2xl font-bold text-white">
        <AnimatedCount value={current} suffix={suffix} />
      </p>
      <div className="mt-1">
        <DeltaIndicator current={current} previous={previous} />
      </div>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function WeeklySummary({
  thisWeek,
  lastWeek,
  dayOfWeek,
}: WeeklySummaryProps) {
  // Guard against division by zero: treat 0 dayOfWeek as 1
  const safeDayOfWeek = Math.max(dayOfWeek, 1);

  // Goal hit rate: current week divides by days elapsed, last week by full 7 days
  const thisWeekGoalRate = Math.round(
    (thisWeek.goalsMet / safeDayOfWeek) * 100
  );
  const lastWeekGoalRate = Math.round((lastWeek.goalsMet / 7) * 100);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      <h3 className="mb-4 text-lg font-semibold text-white">Weekly Summary</h3>

      <div className="grid grid-cols-2 gap-4">
        <StatCard
          label="XP Earned"
          current={thisWeek.totalXp}
          previous={lastWeek.totalXp}
        />
        <StatCard
          label="Lessons Completed"
          current={thisWeek.lessonsCompleted}
          previous={lastWeek.lessonsCompleted}
        />
        <StatCard
          label="Days Active"
          current={thisWeek.daysActive}
          previous={lastWeek.daysActive}
        />
        <StatCard
          label="Goal Hit Rate"
          current={thisWeekGoalRate}
          previous={lastWeekGoalRate}
          suffix="%"
        />
      </div>
    </div>
  );
}
