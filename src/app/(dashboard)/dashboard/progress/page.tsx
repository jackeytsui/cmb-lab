// Progress Dashboard — Server Component
//
// Fetches all progress data server-side in parallel and composes
// the 8 dashboard widgets. No "use client" — pure server component.
//
// Data sources: progress-dashboard.ts (direct DB queries, no self-fetch)

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getXPTimeline,
  getActivityHeatmap,
  getMasteryData,
  getBadgeStats,
  getWeeklySummary,
  getPersonalBests,
  getCohortRankings,
} from "@/lib/progress-dashboard";
import { computeBadges } from "@/lib/badges";
import { calculateLevel } from "@/lib/xp";
import { db } from "@/db";
import { dailyActivity } from "@/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { format, startOfMonth } from "date-fns";
import { TZDate } from "@date-fns/tz";

import { ProgressOverview } from "@/components/progress/ProgressOverview";
import { XPTimeline } from "@/components/progress/XPTimeline";
import { ActivityHeatmap } from "@/components/progress/ActivityHeatmap";
import { MasteryMap } from "@/components/progress/MasteryMap";
import { BadgeCollection } from "@/components/progress/BadgeCollection";
import { WeeklySummary } from "@/components/progress/WeeklySummary";
import { PersonalBests } from "@/components/progress/PersonalBests";
import { CohortRankings } from "@/components/progress/CohortRankings";

// ============================================================
// Streak Freeze Helpers
// ============================================================

/** Max free streak freezes per month */
const MAX_FREEZES_PER_MONTH = 2;

/**
 * Count how many streak freezes were used this calendar month.
 * Reads from daily_activity rows where streakFreezeUsed = true.
 */
async function getFreezesUsedThisMonth(
  userId: string,
  timezone: string
): Promise<number> {
  const now = TZDate.tz(timezone);
  const monthStart = startOfMonth(now);
  const monthStartStr = format(monthStart, "yyyy-MM-dd");

  const [result] = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, monthStartStr),
        eq(dailyActivity.streakFreezeUsed, true)
      )
    );

  return Number(result?.count ?? 0);
}

/**
 * Get today's daily activity counts for the activity rings.
 * Falls back to zeros if no activity today.
 */
async function getTodayActivity(
  userId: string,
  timezone: string
): Promise<{
  lessonCount: number;
  practiceCount: number;
  conversationCount: number;
}> {
  const todayStr = format(TZDate.tz(timezone), "yyyy-MM-dd");

  const [row] = await db
    .select({
      lessonCount: dailyActivity.lessonCount,
      practiceCount: dailyActivity.practiceCount,
      conversationCount: dailyActivity.conversationCount,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        eq(dailyActivity.activityDate, todayStr)
      )
    );

  return {
    lessonCount: row?.lessonCount ?? 0,
    practiceCount: row?.practiceCount ?? 0,
    conversationCount: row?.conversationCount ?? 0,
  };
}

// ============================================================
// Page Component
// ============================================================

export default async function ProgressPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const timezone = user.timezone || "UTC";

  // Parallel fetch all dashboard data
  const [
    dailyTimeline,
    weeklyTimeline,
    monthlyTimeline,
    heatmap,
    mastery,
    badgeStats,
    weekly,
    freezesUsedThisMonth,
    todayActivity,
    personalBests,
    cohortRankings,
  ] = await Promise.all([
    getXPTimeline(user.id, timezone, "daily"),
    getXPTimeline(user.id, timezone, "weekly"),
    getXPTimeline(user.id, timezone, "monthly"),
    getActivityHeatmap(user.id),
    getMasteryData(user.id),
    getBadgeStats(user.id),
    getWeeklySummary(user.id, timezone),
    getFreezesUsedThisMonth(user.id, timezone),
    getTodayActivity(user.id, timezone),
    getPersonalBests(user.id),
    user.showCohortRankings
      ? getCohortRankings(user.id)
      : Promise.resolve(null),
  ]);

  const badges = computeBadges(badgeStats);
  const levelInfo = calculateLevel(badgeStats.totalXP);
  const freezesRemaining = Math.max(
    0,
    MAX_FREEZES_PER_MONTH - freezesUsedThisMonth
  );

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">My Progress</h1>

      {/* Section 1: Overview stats bar (DASH-01) */}
      <ProgressOverview
        totalXP={badgeStats.totalXP}
        level={levelInfo.level}
        currentLevelXP={levelInfo.currentLevelXP}
        nextLevelXP={levelInfo.nextLevelXP}
        currentStreak={badgeStats.currentStreak}
        longestStreak={badgeStats.longestStreak}
        freezesRemaining={freezesRemaining}
        freezesUsedThisMonth={freezesUsedThisMonth}
        dailyActivity={todayActivity}
      />

      {/* Section 2: Personal Bests (SCORE-01) */}
      <PersonalBests data={personalBests} />

      {/* Section 3: Cohort Rankings (SCORE-02, SCORE-03) */}
      <CohortRankings
        initialEnabled={user.showCohortRankings ?? false}
        rankings={cohortRankings}
      />

      {/* Section 4: XP Timeline chart (DASH-02) */}
      <XPTimeline
        dailyData={dailyTimeline}
        weeklyData={weeklyTimeline}
        monthlyData={monthlyTimeline}
      />

      {/* Section 5: Activity Heatmap (DASH-03) */}
      <ActivityHeatmap data={heatmap} />

      {/* Section 6: Mastery Map (DASH-04) */}
      <MasteryMap data={mastery} />

      {/* Section 7: Badge Collection (DASH-05) */}
      <BadgeCollection badges={badges} />

      {/* Section 8: Weekly Summary (DASH-06) */}
      <WeeklySummary
        thisWeek={weekly.thisWeek}
        lastWeek={weekly.lastWeek}
        dayOfWeek={weekly.dayOfWeek}
      />
    </div>
  );
}
