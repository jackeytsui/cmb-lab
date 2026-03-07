"use client";

import { useCallback, useEffect, useState } from "react";
import { ActivityRings, RING_COLORS } from "@/components/xp/ActivityRings";
import { LevelBadge } from "@/components/xp/LevelBadge";
import { StreakDisplay } from "@/components/xp/StreakDisplay";
import { DailyGoalProgress } from "@/components/xp/DailyGoalProgress";
import { ErrorAlert } from "@/components/ui/error-alert";
import { Skeleton } from "@/components/ui/skeleton";
import { RING_GOALS } from "@/lib/xp";

// ============================================================
// Types
// ============================================================

interface XPDashboardData {
  level: {
    level: number;
    currentLevelXP: number;
    nextLevelXP: number;
    totalXP: number;
  };
  streak: {
    currentStreak: number;
    longestStreak: number;
    freezesUsedThisMonth: number;
    freezesRemaining: number;
  };
  daily: {
    totalXp: number;
    lessonCount: number;
    practiceCount: number;
    conversationCount: number;
    goalXp: number;
    goalMet: boolean;
  };
  rings: {
    learn: number;
    practice: number;
    speak: number;
  };
}

// ============================================================
// Loading Skeleton
// ============================================================

function XPOverviewSkeleton() {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      {/* Title skeleton */}
      <Skeleton className="mb-6 h-6 w-40 bg-zinc-800" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: rings + daily goal */}
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-[140px] w-[140px] rounded-full bg-zinc-800" />
          <Skeleton className="h-3 w-full max-w-[200px] rounded-full bg-zinc-800" />
        </div>

        {/* Right column: level + streak */}
        <div className="flex flex-col items-center gap-4">
          <Skeleton className="h-20 w-20 rounded-full bg-zinc-800" />
          <Skeleton className="h-2 w-[160px] rounded-full bg-zinc-800" />
          <div className="mt-2 flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded bg-zinc-800" />
            <Skeleton className="h-8 w-12 rounded bg-zinc-800" />
          </div>
          <Skeleton className="h-4 w-24 rounded bg-zinc-800" />
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Component
// ============================================================

export function XPOverview() {
  const [data, setData] = useState<XPDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchXPData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/xp");

      if (!res.ok) {
        // Don't treat 401 as an error — user may not be authenticated yet
        if (res.status === 401) {
          setLoading(false);
          return;
        }
        throw new Error(`Failed to load XP data (${res.status})`);
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("[XPOverview] Fetch failed:", err);
      setError(
        err instanceof Error ? err.message : "Unable to load XP data"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchXPData();
  }, [fetchXPData]);

  // Loading state
  if (loading) {
    return <XPOverviewSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="mb-4 text-lg font-semibold text-zinc-100">
          XP &amp; Activity
        </h3>
        <ErrorAlert
          variant="block"
          message={error}
          onRetry={fetchXPData}
        />
      </div>
    );
  }

  // No data (unauthenticated or no XP yet) — render nothing gracefully
  if (!data) {
    return null;
  }

  // Build rings array for ActivityRings component
  const rings = [
    {
      label: "Learn",
      current: data.daily.lessonCount,
      goal: RING_GOALS.learn,
      color: RING_COLORS.learn,
    },
    {
      label: "Practice",
      current: data.daily.practiceCount,
      goal: RING_GOALS.practice,
      color: RING_COLORS.practice,
    },
    {
      label: "Speak",
      current: data.daily.conversationCount,
      goal: RING_GOALS.speak,
      color: RING_COLORS.speak,
    },
  ];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h3 className="mb-6 text-lg font-semibold text-zinc-100">
        XP &amp; Activity
      </h3>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left column: Activity Rings + Daily Goal */}
        <div className="flex flex-col items-center gap-5">
          <ActivityRings rings={rings} size={160} />
          <DailyGoalProgress
            currentXP={data.daily.totalXp}
            goalXP={data.daily.goalXp}
            goalMet={data.daily.goalMet}
            className="w-full max-w-[240px]"
          />
        </div>

        {/* Right column: Level Badge + Streak */}
        <div className="flex flex-col items-center gap-5">
          <LevelBadge
            level={data.level.level}
            currentLevelXP={data.level.currentLevelXP}
            nextLevelXP={data.level.nextLevelXP}
            totalXP={data.level.totalXP}
          />
          <div className="h-px w-full max-w-[160px] bg-zinc-800" />
          <StreakDisplay
            currentStreak={data.streak.currentStreak}
            longestStreak={data.streak.longestStreak}
            freezesRemaining={data.streak.freezesRemaining}
            freezesUsedThisMonth={data.streak.freezesUsedThisMonth}
          />
        </div>
      </div>
    </div>
  );
}
