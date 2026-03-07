// XP Service — Database Operations
//
// This module is the engine that makes XP flow. It provides:
// - awardXP: Insert XP events, upsert daily activity, auto-award daily goal bonus
// - getStreak: Calculate current streak with freeze support
// - getDailyActivity: Today's activity summary
// - getXPDashboard: Aggregated dashboard data (level, streak, daily, rings)

import { db } from "@/db";
import { users, xpEvents, dailyActivity } from "@/db/schema";
import type { XPSource } from "@/db/schema";
import { eq, and, sql, desc, sum, gte, lte } from "drizzle-orm";
import {
  calculateLevel,
  getEffectiveDate,
  RING_GOALS,
  XP_AMOUNTS,
} from "@/lib/xp";

// ============================================================
// Types
// ============================================================

interface AwardXPParams {
  userId: string;
  source: XPSource;
  amount: number;
  entityId?: string | null;
  entityType?: string | null;
}

interface AwardXPResult {
  xpAwarded: number;
  dailyTotal: number;
  goalMet: boolean;
  goalJustMet: boolean;
}

interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  freezesUsedThisMonth: number;
  freezesRemaining: number;
}

interface DailyActivitySummary {
  totalXp: number;
  lessonCount: number;
  practiceCount: number;
  conversationCount: number;
  goalXp: number;
  goalMet: boolean;
}

interface RingData {
  learn: number;
  practice: number;
  speak: number;
}

interface XPDashboard {
  level: {
    level: number;
    currentLevelXP: number;
    nextLevelXP: number;
    totalXP: number;
  };
  streak: StreakInfo;
  daily: DailyActivitySummary;
  rings: RingData;
}

// ============================================================
// awardXP — Core XP Award Function
// ============================================================

/**
 * Award XP to a user. Inserts an xp_events row and upserts daily_activity.
 * If the daily goal is crossed, auto-awards a 10 XP bonus (non-recursive).
 * Updates longestStreak if the current streak exceeds stored value.
 *
 * Designed for fire-and-forget usage: call with .catch() to avoid blocking.
 */
export async function awardXP(params: AwardXPParams): Promise<AwardXPResult> {
  const { userId, source, amount, entityId, entityType } = params;

  // 1. Insert append-only XP event
  await db.insert(xpEvents).values({
    userId,
    source,
    amount,
    entityId: entityId ?? null,
    entityType: entityType ?? null,
  });

  // 2. Fetch user timezone and daily goal
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      timezone: true,
      dailyGoalXp: true,
      longestStreak: true,
    },
  });

  const timezone = user?.timezone ?? "UTC";
  const dailyGoalXp = user?.dailyGoalXp ?? 100;

  // 3. Compute effective date (4-hour grace period)
  const effectiveDate = getEffectiveDate(timezone);

  // 4. Determine which source counter to increment
  const lessonInc = source === "lesson_complete" ? 1 : 0;
  const practiceInc =
    source === "practice_exercise" || source === "practice_perfect" ? 1 : 0;
  const conversationInc = source === "voice_conversation" ? 1 : 0;

  // 5. Upsert daily_activity with ON CONFLICT increment
  const [upserted] = await db
    .insert(dailyActivity)
    .values({
      userId,
      activityDate: effectiveDate,
      totalXp: amount,
      lessonCount: lessonInc,
      practiceCount: practiceInc,
      conversationCount: conversationInc,
      goalXp: dailyGoalXp,
      goalMet: amount >= dailyGoalXp,
    })
    .onConflictDoUpdate({
      target: [dailyActivity.userId, dailyActivity.activityDate],
      set: {
        totalXp: sql`${dailyActivity.totalXp} + ${amount}`,
        lessonCount: sql`${dailyActivity.lessonCount} + ${lessonInc}`,
        practiceCount: sql`${dailyActivity.practiceCount} + ${practiceInc}`,
        conversationCount: sql`${dailyActivity.conversationCount} + ${conversationInc}`,
        goalMet: sql`CASE WHEN ${dailyActivity.totalXp} + ${amount} >= ${dailyActivity.goalXp} THEN true ELSE ${dailyActivity.goalMet} END`,
        updatedAt: new Date(),
      },
    })
    .returning();

  const dailyTotal = upserted.totalXp;
  const goalMet = upserted.goalMet;

  // 6. Check if daily goal JUST crossed (only for non-bonus sources)
  // goalJustMet = totalXp crossed the threshold with this award
  const goalJustMet =
    source !== "daily_goal_met" &&
    goalMet &&
    dailyTotal - amount < upserted.goalXp;

  // 7. Auto-award daily goal bonus if just met (non-recursive guard via source check)
  if (goalJustMet) {
    // Fire-and-forget the bonus award (it won't recurse because source = "daily_goal_met")
    awardXP({
      userId,
      source: "daily_goal_met",
      amount: XP_AMOUNTS.daily_goal_met,
      entityId: null,
      entityType: null,
    }).catch((err) => console.error("[XP] Daily goal bonus award failed:", err));
  }

  // 8. Update longestStreak if needed
  try {
    const streak = await getStreak(userId);
    if (user && streak.currentStreak > user.longestStreak) {
      await db
        .update(users)
        .set({ longestStreak: streak.currentStreak })
        .where(eq(users.id, userId));
    }
  } catch (err) {
    // Non-critical: don't fail the XP award if streak update fails
    console.error("[XP] Streak update failed:", err);
  }

  return {
    xpAwarded: amount,
    dailyTotal,
    goalMet,
    goalJustMet,
  };
}

// ============================================================
// getStreak — Streak Calculation with Freeze Support
// ============================================================

/**
 * Calculate the user's current streak by walking backward through daily_activity rows.
 * Supports up to 2 streak freezes per month (auto-applied on 1-day gaps).
 */
export async function getStreak(userId: string): Promise<StreakInfo> {
  // 1. Fetch user timezone and longestStreak
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      timezone: true,
      longestStreak: true,
    },
  });

  const timezone = user?.timezone ?? "UTC";
  const longestStreak = user?.longestStreak ?? 0;

  // 2. Compute effective today
  const effectiveToday = getEffectiveDate(timezone);

  // 3. Fetch all daily_activity rows ordered by date DESC
  const activities = await db
    .select({
      activityDate: dailyActivity.activityDate,
      streakFreezeUsed: dailyActivity.streakFreezeUsed,
    })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId))
    .orderBy(desc(dailyActivity.activityDate));

  if (activities.length === 0) {
    return {
      currentStreak: 0,
      longestStreak,
      freezesUsedThisMonth: 0,
      freezesRemaining: 2,
    };
  }

  // Build a Set of active dates for quick lookup
  const activeDates = new Set(activities.map((a) => a.activityDate));

  // 4. Walk backward from effectiveToday
  let currentStreak = 0;
  let checkDate = effectiveToday;

  // If there's no activity today, check if yesterday has activity (mid-day scenario)
  if (!activeDates.has(checkDate)) {
    const yesterday = subtractDays(checkDate, 1);
    if (activeDates.has(yesterday)) {
      // Start counting from yesterday
      checkDate = yesterday;
    } else {
      // No recent activity — streak is 0
      return {
        currentStreak: 0,
        longestStreak,
        freezesUsedThisMonth: countFreezesThisMonth(activities, effectiveToday),
        freezesRemaining: Math.max(
          0,
          2 - countFreezesThisMonth(activities, effectiveToday)
        ),
      };
    }
  }

  // Walk backward counting consecutive days (with freeze support)
  const freezesThisMonth = countFreezesThisMonth(activities, effectiveToday);
  let freezesAvailable = Math.max(0, 2 - freezesThisMonth);

  while (true) {
    if (activeDates.has(checkDate)) {
      currentStreak++;
      checkDate = subtractDays(checkDate, 1);
    } else if (freezesAvailable > 0) {
      // 1-day gap: auto-apply freeze
      currentStreak++; // The freeze "fills in" the gap day
      freezesAvailable--;
      checkDate = subtractDays(checkDate, 1);
    } else {
      // Gap too large or no freezes left — streak ends
      break;
    }
  }

  return {
    currentStreak,
    longestStreak: Math.max(longestStreak, currentStreak),
    freezesUsedThisMonth: freezesThisMonth,
    freezesRemaining: Math.max(0, 2 - freezesThisMonth),
  };
}

// ============================================================
// getDailyActivity — Today's Summary
// ============================================================

/**
 * Get the current user's daily activity for today (effective date).
 * Returns default zeros if no activity exists yet.
 */
export async function getDailyActivity(
  userId: string
): Promise<DailyActivitySummary> {
  // 1. Fetch user timezone and daily goal
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      timezone: true,
      dailyGoalXp: true,
    },
  });

  const timezone = user?.timezone ?? "UTC";
  const dailyGoalXp = user?.dailyGoalXp ?? 100;

  // 2. Compute effective today
  const effectiveDate = getEffectiveDate(timezone);

  // 3. Query daily_activity for today
  const activity = await db.query.dailyActivity.findFirst({
    where: and(
      eq(dailyActivity.userId, userId),
      eq(dailyActivity.activityDate, effectiveDate)
    ),
  });

  if (!activity) {
    return {
      totalXp: 0,
      lessonCount: 0,
      practiceCount: 0,
      conversationCount: 0,
      goalXp: dailyGoalXp,
      goalMet: false,
    };
  }

  return {
    totalXp: activity.totalXp,
    lessonCount: activity.lessonCount,
    practiceCount: activity.practiceCount,
    conversationCount: activity.conversationCount,
    goalXp: activity.goalXp,
    goalMet: activity.goalMet,
  };
}

// ============================================================
// getXPDashboard — Aggregated Dashboard Data
// ============================================================

/**
 * Get the full XP dashboard data for a user.
 * Returns level info, streak, daily activity, and activity ring progress.
 */
export async function getXPDashboard(userId: string): Promise<XPDashboard> {
  // 1. Get total XP from xp_events
  const [xpResult] = await db
    .select({ total: sum(xpEvents.amount) })
    .from(xpEvents)
    .where(eq(xpEvents.userId, userId));

  const totalXP = Number(xpResult?.total ?? 0);

  // 2. Calculate level info
  const level = calculateLevel(totalXP);

  // 3. Get streak info
  const streak = await getStreak(userId);

  // 4. Get today's daily activity
  const daily = await getDailyActivity(userId);

  // 5. Compute ring data (progress toward daily goals)
  const rings: RingData = {
    learn: Math.min(daily.lessonCount / RING_GOALS.learn, 1),
    practice: Math.min(daily.practiceCount / RING_GOALS.practice, 1),
    speak: Math.min(daily.conversationCount / RING_GOALS.speak, 1),
  };

  return {
    level,
    streak,
    daily,
    rings,
  };
}

// ============================================================
// Helper Functions
// ============================================================

/**
 * Subtract N days from a YYYY-MM-DD date string, returning a new YYYY-MM-DD string.
 */
function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00Z"); // Use noon UTC to avoid DST issues
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Count streak freezes used this month from daily_activity rows.
 * "This month" is based on the effective today's year-month.
 */
function countFreezesThisMonth(
  activities: { activityDate: string; streakFreezeUsed: boolean }[],
  effectiveToday: string
): number {
  const yearMonth = effectiveToday.slice(0, 7); // "YYYY-MM"
  return activities.filter(
    (a) =>
      a.streakFreezeUsed && a.activityDate.startsWith(yearMonth)
  ).length;
}
