"use client";

import { ActivityRings, RING_COLORS } from "@/components/xp/ActivityRings";
import type { RingData } from "@/components/xp/ActivityRings";
import { LevelBadge } from "@/components/xp/LevelBadge";
import { StreakDisplay } from "@/components/xp/StreakDisplay";
import { RING_GOALS } from "@/lib/xp";

// ============================================================
// Types
// ============================================================

interface ProgressOverviewProps {
  totalXP: number;
  level: number;
  currentLevelXP: number;
  nextLevelXP: number;
  currentStreak: number;
  longestStreak: number;
  freezesRemaining: number;
  freezesUsedThisMonth: number;
  dailyActivity: {
    lessonCount: number;
    practiceCount: number;
    conversationCount: number;
  };
}

// ============================================================
// Component
// ============================================================

export function ProgressOverview({
  totalXP,
  level,
  currentLevelXP,
  nextLevelXP,
  currentStreak,
  longestStreak,
  freezesRemaining,
  freezesUsedThisMonth,
  dailyActivity,
}: ProgressOverviewProps) {
  // Build rings data array from daily activity counts
  const rings: RingData[] = [
    {
      label: "Learn",
      current: dailyActivity.lessonCount,
      goal: RING_GOALS.learn,
      color: RING_COLORS.learn,
    },
    {
      label: "Practice",
      current: dailyActivity.practiceCount,
      goal: RING_GOALS.practice,
      color: RING_COLORS.practice,
    },
    {
      label: "Speak",
      current: dailyActivity.conversationCount,
      goal: RING_GOALS.speak,
      color: RING_COLORS.speak,
    },
  ];

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
      {/* Desktop: horizontal row | Mobile: 2x2 grid + rings */}
      <div className="grid grid-cols-2 gap-6 md:flex md:items-center md:gap-6">
        {/* Total XP */}
        <div className="flex flex-col items-center">
          <p className="text-3xl font-bold text-white">
            {totalXP.toLocaleString()}
          </p>
          <p className="text-xs text-zinc-500">XP</p>
        </div>

        {/* Divider (desktop only) */}
        <div className="hidden border-l border-zinc-800 md:block md:h-12" />

        {/* Level */}
        <div className="flex flex-col items-center gap-2">
          <LevelBadge
            level={level}
            currentLevelXP={currentLevelXP}
            nextLevelXP={nextLevelXP}
            totalXP={totalXP}
            className="scale-75"
          />
        </div>

        {/* Divider (desktop only) */}
        <div className="hidden border-l border-zinc-800 md:block md:h-12" />

        {/* Streak */}
        <div className="flex flex-col items-center">
          <StreakDisplay
            currentStreak={currentStreak}
            longestStreak={longestStreak}
            freezesRemaining={freezesRemaining}
            freezesUsedThisMonth={freezesUsedThisMonth}
            className="scale-75"
          />
        </div>

        {/* Divider (desktop only) */}
        <div className="hidden border-l border-zinc-800 md:block md:h-12" />

        {/* Activity Rings */}
        <div className="col-span-2 flex justify-center md:col-span-1">
          <ActivityRings rings={rings} size={100} />
        </div>
      </div>
    </div>
  );
}
