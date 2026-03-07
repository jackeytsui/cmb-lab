// Progress Dashboard — Server-Side Data Fetching
//
// All functions query the DB directly via Drizzle (NO self-fetch API routes).
// This avoids the known 401 bug where server components that fetch their own
// API routes don't forward auth cookies.
//
// Consumed by: src/app/(dashboard)/dashboard/progress/page.tsx (plans 03-05)

import { db } from "@/db";
import {
  dailyActivity,
  courseAccess,
  courses,
  modules,
  lessons,
  lessonProgress,
  users,
  practiceAttempts,
} from "@/db/schema";
import { eq, and, gte, lte, sql, isNull, desc } from "drizzle-orm";
import {
  subDays,
  format,
  eachDayOfInterval,
  startOfWeek,
  startOfMonth,
} from "date-fns";
import { TZDate } from "@date-fns/tz";
import type { UserStats } from "@/lib/badges";

// ============================================================
// Types
// ============================================================

export interface TimelineDataPoint {
  date: string;
  xp: number;
}

export interface HeatmapDay {
  date: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface MasteryModule {
  moduleId: string;
  moduleTitle: string;
  totalLessons: number;
  completedLessons: number;
}

export interface MasteryCourse {
  courseId: string;
  courseTitle: string;
  modules: MasteryModule[];
  totalLessons: number;
  completedLessons: number;
}

export interface WeekStats {
  totalXp: number;
  lessonsCompleted: number;
  practiceCompleted: number;
  daysActive: number;
  goalsMet: number;
}

export interface WeeklySummaryResult {
  thisWeek: WeekStats;
  lastWeek: WeekStats;
  dayOfWeek: number; // 1=Monday to 7=Sunday
}

export interface PersonalBests {
  longestStreak: number;
  highestDailyXP: number;
  highestDailyXPDate: string | null;
  bestPracticeScore: number | null;
  totalLessonsCompleted: number;
  totalPracticeSetsCompleted: number;
  totalConversations: number;
}

export interface CohortRanking {
  dimension: string;
  label: string;
  userValue: number;
  percentileBucket: string; // "Top 5%", "Top 10%", "Top 25%", "Top 50%", "Top 75%", "Top 90%", "Bottom half"
  totalStudents: number;
}

// ============================================================
// 1. XP Timeline
// ============================================================

/**
 * Get XP timeline data for area chart visualization.
 * Returns data points with date and XP, filling gaps with 0.
 *
 * @param range "daily" = 30 days, "weekly" = 90 days, "monthly" = 365 days
 */
export async function getXPTimeline(
  userId: string,
  timezone: string,
  range: "daily" | "weekly" | "monthly" = "daily"
): Promise<TimelineDataPoint[]> {
  const now = TZDate.tz(timezone);
  const daysBack = range === "daily" ? 30 : range === "weekly" ? 90 : 365;
  const startDate = subDays(now, daysBack);
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(now, "yyyy-MM-dd");

  const rows = await db
    .select({
      date: dailyActivity.activityDate,
      xp: dailyActivity.totalXp,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, startDateStr),
        lte(dailyActivity.activityDate, endDateStr)
      )
    )
    .orderBy(dailyActivity.activityDate);

  // Build lookup map: date string -> XP
  const xpMap = new Map<string, number>();
  for (const row of rows) {
    const existing = xpMap.get(row.date) ?? 0;
    xpMap.set(row.date, existing + row.xp);
  }

  if (range === "daily") {
    // One data point per day, fill gaps with 0
    const allDays = eachDayOfInterval({ start: startDate, end: now });
    return allDays.map((day) => {
      const dateStr = format(day, "yyyy-MM-dd");
      return {
        date: dateStr,
        xp: xpMap.get(dateStr) ?? 0,
      };
    });
  }

  if (range === "weekly") {
    // Group by ISO week (Monday start), sum XP per week
    const allDays = eachDayOfInterval({ start: startDate, end: now });
    const weekMap = new Map<string, number>();

    for (const day of allDays) {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      const weekKey = format(weekStart, "yyyy-MM-dd");
      const dateStr = format(day, "yyyy-MM-dd");
      const dayXP = xpMap.get(dateStr) ?? 0;
      weekMap.set(weekKey, (weekMap.get(weekKey) ?? 0) + dayXP);
    }

    // Sort by week start date and format for display
    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, xp]) => ({
        date: format(new Date(weekStart + "T00:00:00"), "MMM d"),
        xp,
      }));
  }

  // Monthly: group by month, sum XP per month
  const allDays = eachDayOfInterval({ start: startDate, end: now });
  const monthMap = new Map<string, number>();

  for (const day of allDays) {
    const monthStart = startOfMonth(day);
    const monthKey = format(monthStart, "yyyy-MM-dd");
    const dateStr = format(day, "yyyy-MM-dd");
    const dayXP = xpMap.get(dateStr) ?? 0;
    monthMap.set(monthKey, (monthMap.get(monthKey) ?? 0) + dayXP);
  }

  return Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthStart, xp]) => ({
      date: format(new Date(monthStart + "T00:00:00"), "MMM yyyy"),
      xp,
    }));
}

// ============================================================
// 2. Activity Heatmap
// ============================================================

/**
 * Compute heatmap level from total XP for a single day.
 * Thresholds: 0 = no activity, <25 = light, <75 = moderate, <150 = active, >=150 = very active
 */
function computeLevel(totalXp: number): 0 | 1 | 2 | 3 | 4 {
  if (totalXp === 0) return 0;
  if (totalXp < 25) return 1;
  if (totalXp < 75) return 2;
  if (totalXp < 150) return 3;
  return 4;
}

/**
 * Get 365 days of activity data for the heatmap.
 * Returns a contiguous array (react-activity-calendar requires this).
 */
export async function getActivityHeatmap(
  userId: string
): Promise<HeatmapDay[]> {
  const endDate = new Date();
  const startDate = subDays(endDate, 364);
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  const rows = await db
    .select({
      date: dailyActivity.activityDate,
      totalXp: dailyActivity.totalXp,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, startDateStr),
        lte(dailyActivity.activityDate, endDateStr)
      )
    );

  // Build lookup map
  const activityMap = new Map(rows.map((r) => [r.date, r.totalXp]));

  // Generate contiguous 365-day array
  const allDays = eachDayOfInterval({ start: startDate, end: endDate });

  return allDays.map((day) => {
    const dateStr = format(day, "yyyy-MM-dd");
    const totalXp = activityMap.get(dateStr) ?? 0;
    return {
      date: dateStr,
      count: totalXp,
      level: computeLevel(totalXp),
    };
  });
}

// ============================================================
// 3. Mastery Data
// ============================================================

/**
 * Get course/module/lesson completion data for the mastery map.
 * Uses a single SQL query with JOINs to avoid N+1.
 */
export async function getMasteryData(
  userId: string
): Promise<MasteryCourse[]> {
  const rows = await db
    .select({
      courseId: courses.id,
      courseTitle: courses.title,
      moduleId: modules.id,
      moduleTitle: modules.title,
      totalLessons: sql<number>`COUNT(DISTINCT ${lessons.id})`.as(
        "total_lessons"
      ),
      completedLessons:
        sql<number>`COUNT(DISTINCT CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN ${lessonProgress.lessonId} END)`.as(
          "completed_lessons"
        ),
    })
    .from(courseAccess)
    .innerJoin(courses, eq(courseAccess.courseId, courses.id))
    .innerJoin(modules, eq(modules.courseId, courses.id))
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .leftJoin(
      lessonProgress,
      and(
        eq(lessonProgress.lessonId, lessons.id),
        eq(lessonProgress.userId, courseAccess.userId)
      )
    )
    .where(
      and(
        eq(courseAccess.userId, userId),
        isNull(courses.deletedAt),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt)
      )
    )
    .groupBy(courses.id, courses.title, modules.id, modules.title)
    .orderBy(courses.title, modules.title);

  // Reshape flat rows into nested course -> modules structure
  const courseMap = new Map<string, MasteryCourse>();

  for (const row of rows) {
    let course = courseMap.get(row.courseId);
    if (!course) {
      course = {
        courseId: row.courseId,
        courseTitle: row.courseTitle,
        modules: [],
        totalLessons: 0,
        completedLessons: 0,
      };
      courseMap.set(row.courseId, course);
    }

    // Only add module if it actually has lessons (moduleId could be from a left join)
    if (row.moduleId && row.totalLessons > 0) {
      course.modules.push({
        moduleId: row.moduleId,
        moduleTitle: row.moduleTitle,
        totalLessons: Number(row.totalLessons),
        completedLessons: Number(row.completedLessons),
      });
    }
  }

  // Compute course-level totals by summing module totals
  for (const course of courseMap.values()) {
    course.totalLessons = course.modules.reduce(
      (sum, m) => sum + m.totalLessons,
      0
    );
    course.completedLessons = course.modules.reduce(
      (sum, m) => sum + m.completedLessons,
      0
    );
  }

  return Array.from(courseMap.values());
}

// ============================================================
// 4. Badge Stats
// ============================================================

/**
 * Get all stats needed for badge computation.
 * Runs parallel queries and assembles into UserStats.
 */
export async function getBadgeStats(userId: string): Promise<UserStats> {
  const [
    xpResult,
    userResult,
    lessonsResult,
    practiceCompletedResult,
    practicePerfectResult,
    conversationResult,
    daysActiveResult,
    streakRows,
  ] = await Promise.all([
    // Total XP
    db
      .select({
        total: sql<number>`COALESCE(SUM(${dailyActivity.totalXp}), 0)`,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId)),

    // Longest streak (stored on user record)
    db
      .select({ longestStreak: users.longestStreak })
      .from(users)
      .where(eq(users.id, userId)),

    // Lessons completed
    db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          sql`${lessonProgress.completedAt} IS NOT NULL`
        )
      ),

    // Practice sets completed
    db
      .select({
        count: sql<number>`COUNT(DISTINCT ${practiceAttempts.id})`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`${practiceAttempts.completedAt} IS NOT NULL`
        )
      ),

    // Practice sets perfect (score >= 95)
    db
      .select({
        count: sql<number>`COUNT(DISTINCT ${practiceAttempts.id})`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`${practiceAttempts.completedAt} IS NOT NULL`,
          gte(practiceAttempts.score, 95)
        )
      ),

    // Conversation count (sum from daily_activity)
    db
      .select({
        total:
          sql<number>`COALESCE(SUM(${dailyActivity.conversationCount}), 0)`,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId)),

    // Days active
    db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId)),

    // Recent daily activity rows for current streak computation
    // Walk backwards from today checking consecutive days
    db
      .select({
        activityDate: dailyActivity.activityDate,
        streakFreezeUsed: dailyActivity.streakFreezeUsed,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId))
      .orderBy(desc(dailyActivity.activityDate))
      .limit(60), // 60 days lookback is plenty for current streak
  ]);

  // Compute current streak from recent activity rows
  const currentStreak = computeCurrentStreak(streakRows);

  return {
    totalXP: Number(xpResult[0]?.total ?? 0),
    longestStreak: userResult[0]?.longestStreak ?? 0,
    currentStreak,
    lessonsCompleted: Number(lessonsResult[0]?.count ?? 0),
    practiceSetsCompleted: Number(practiceCompletedResult[0]?.count ?? 0),
    practiceSetsPerfect: Number(practicePerfectResult[0]?.count ?? 0),
    conversationCount: Number(conversationResult[0]?.total ?? 0),
    daysActive: Number(daysActiveResult[0]?.count ?? 0),
  };
}

/**
 * Compute current streak by walking backwards from today through recent activity rows.
 * Streak freezes count as streak continuation (1-day gaps with freeze used).
 */
function computeCurrentStreak(
  rows: { activityDate: string; streakFreezeUsed: boolean }[]
): number {
  if (rows.length === 0) return 0;

  const today = format(new Date(), "yyyy-MM-dd");
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");

  // Check if user was active today or yesterday (streak is still alive)
  const mostRecent = rows[0]?.activityDate;
  if (mostRecent !== today && mostRecent !== yesterday) {
    return 0; // Streak is broken
  }

  let streak = 0;
  let expectedDate = mostRecent;

  for (const row of rows) {
    if (row.activityDate === expectedDate) {
      streak++;
      // Move expected date to previous day
      expectedDate = format(
        subDays(new Date(row.activityDate + "T00:00:00"), 1),
        "yyyy-MM-dd"
      );
    } else {
      // Check if this is a 1-day gap with freeze on the gap day
      const gapDate = expectedDate;
      if (row.activityDate === format(subDays(new Date(gapDate + "T00:00:00"), 1), "yyyy-MM-dd")) {
        // There was a gap day — check if freeze was used
        // The freeze would be on the gap day (which has no row in daily_activity),
        // but the next activity row after the gap might indicate freeze was used.
        // Per project convention: streak freeze auto-applies on 1-day gaps during backward walk
        streak++; // Count the freeze day
        streak++; // Count this activity day
        expectedDate = format(
          subDays(new Date(row.activityDate + "T00:00:00"), 1),
          "yyyy-MM-dd"
        );
      } else {
        break; // Gap too large, streak ends
      }
    }
  }

  return streak;
}

// ============================================================
// 5. Weekly Summary
// ============================================================

/**
 * Get this week vs last week comparison stats.
 * Returns stats for both weeks plus current day of week (1=Mon to 7=Sun).
 */
export async function getWeeklySummary(
  userId: string,
  timezone: string
): Promise<WeeklySummaryResult> {
  const now = TZDate.tz(timezone);
  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const lastWeekStart = subDays(thisWeekStart, 7);
  const lastWeekEnd = subDays(thisWeekStart, 1);

  const thisWeekStartStr = format(thisWeekStart, "yyyy-MM-dd");
  const lastWeekStartStr = format(lastWeekStart, "yyyy-MM-dd");
  const lastWeekEndStr = format(lastWeekEnd, "yyyy-MM-dd");
  const todayStr = format(now, "yyyy-MM-dd");

  const [thisWeek, lastWeek] = await Promise.all([
    aggregateWeek(userId, thisWeekStartStr, todayStr),
    aggregateWeek(userId, lastWeekStartStr, lastWeekEndStr),
  ]);

  // Calculate day of week: 1=Monday to 7=Sunday
  // JavaScript getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
  const jsDay = now.getDay();
  const dayOfWeek = jsDay === 0 ? 7 : jsDay;

  return {
    thisWeek,
    lastWeek,
    dayOfWeek,
  };
}

/**
 * Aggregate week stats from dailyActivity for a date range.
 * Returns all zeros cleanly when no activity exists.
 */
async function aggregateWeek(
  userId: string,
  start: string,
  end: string
): Promise<WeekStats> {
  const [result] = await db
    .select({
      totalXp: sql<number>`COALESCE(SUM(${dailyActivity.totalXp}), 0)`,
      lessonsCompleted:
        sql<number>`COALESCE(SUM(${dailyActivity.lessonCount}), 0)`,
      practiceCompleted:
        sql<number>`COALESCE(SUM(${dailyActivity.practiceCount}), 0)`,
      daysActive: sql<number>`COUNT(*)`,
      goalsMet:
        sql<number>`COALESCE(SUM(CASE WHEN ${dailyActivity.goalMet} THEN 1 ELSE 0 END), 0)`,
    })
    .from(dailyActivity)
    .where(
      and(
        eq(dailyActivity.userId, userId),
        gte(dailyActivity.activityDate, start),
        lte(dailyActivity.activityDate, end)
      )
    );

  return {
    totalXp: Number(result?.totalXp ?? 0),
    lessonsCompleted: Number(result?.lessonsCompleted ?? 0),
    practiceCompleted: Number(result?.practiceCompleted ?? 0),
    daysActive: Number(result?.daysActive ?? 0),
    goalsMet: Number(result?.goalsMet ?? 0),
  };
}

// ============================================================
// 6. Personal Bests
// ============================================================

/**
 * Get a student's personal best records across all activity dimensions.
 * Uses parallel queries for performance (follows getBadgeStats pattern).
 */
export async function getPersonalBests(
  userId: string
): Promise<PersonalBests> {
  const [
    streakResult,
    highestDailyXPResult,
    bestPracticeScoreResult,
    lessonsCompletedResult,
    practiceCompletedResult,
    conversationResult,
  ] = await Promise.all([
    // 1. Longest streak (stored on user record)
    db
      .select({ longestStreak: users.longestStreak })
      .from(users)
      .where(eq(users.id, userId)),

    // 2. Highest daily XP + date of that day
    db
      .select({
        maxXp: sql<number>`COALESCE(MAX(${dailyActivity.totalXp}), 0)`,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId))
      .then(async (rows) => {
        const maxXp = Number(rows[0]?.maxXp ?? 0);
        if (maxXp === 0) return { maxXp: 0, date: null as string | null };
        // Get the date of the highest XP day
        const [dateRow] = await db
          .select({ activityDate: dailyActivity.activityDate })
          .from(dailyActivity)
          .where(
            and(
              eq(dailyActivity.userId, userId),
              eq(dailyActivity.totalXp, maxXp)
            )
          )
          .orderBy(desc(dailyActivity.activityDate))
          .limit(1);
        return { maxXp, date: dateRow?.activityDate ?? null };
      }),

    // 3. Best practice score (completed attempts only — Pitfall 7)
    db
      .select({
        bestScore: sql<number | null>`MAX(${practiceAttempts.score})`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`${practiceAttempts.completedAt} IS NOT NULL`
        )
      ),

    // 4. Total lessons completed
    db
      .select({
        count: sql<number>`COUNT(*)`,
      })
      .from(lessonProgress)
      .where(
        and(
          eq(lessonProgress.userId, userId),
          sql`${lessonProgress.completedAt} IS NOT NULL`
        )
      ),

    // 5. Total practice sets completed
    db
      .select({
        count: sql<number>`COUNT(DISTINCT ${practiceAttempts.id})`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`${practiceAttempts.completedAt} IS NOT NULL`
        )
      ),

    // 6. Total conversations
    db
      .select({
        total:
          sql<number>`COALESCE(SUM(${dailyActivity.conversationCount}), 0)`,
      })
      .from(dailyActivity)
      .where(eq(dailyActivity.userId, userId)),
  ]);

  return {
    longestStreak: streakResult[0]?.longestStreak ?? 0,
    highestDailyXP: highestDailyXPResult.maxXp,
    highestDailyXPDate: highestDailyXPResult.date,
    bestPracticeScore:
      bestPracticeScoreResult[0]?.bestScore != null
        ? Number(bestPracticeScoreResult[0].bestScore)
        : null,
    totalLessonsCompleted: Number(lessonsCompletedResult[0]?.count ?? 0),
    totalPracticeSetsCompleted: Number(practiceCompletedResult[0]?.count ?? 0),
    totalConversations: Number(conversationResult[0]?.total ?? 0),
  };
}

// ============================================================
// 7. Cohort Rankings
// ============================================================

/**
 * Map a percentile rank (0-100) to a friendly bucket label.
 */
function percentileToBucket(percentile: number): string {
  if (percentile >= 95) return "Top 5%";
  if (percentile >= 90) return "Top 10%";
  if (percentile >= 75) return "Top 25%";
  if (percentile >= 50) return "Top 50%";
  if (percentile >= 25) return "Top 75%";
  if (percentile >= 10) return "Top 90%";
  return "Bottom half";
}

/**
 * Get the user's cohort percentile rankings across key dimensions.
 * Returns null if fewer than 5 active students exist (minimum cohort threshold).
 *
 * Dimensions:
 * - Total XP (all active students)
 * - Longest streak (all active students)
 * - Average practice score (only students with >= 3 completed attempts)
 */
export async function getCohortRankings(
  userId: string
): Promise<CohortRanking[] | null> {
  // Step 1: Count active students (have at least 1 day of activity, are students, not deleted)
  const activeCountRows = await db.execute(sql`
    SELECT COUNT(DISTINCT da.user_id) AS total
    FROM daily_activity da
    INNER JOIN users u ON u.id = da.user_id
    WHERE u.role = 'student' AND u.deleted_at IS NULL
  `);

  const totalActiveStudents = Number(activeCountRows.rows[0]?.total ?? 0);

  // Minimum cohort threshold
  if (totalActiveStudents < 5) return null;

  // Step 2: Get the user's own values
  const [userXPResult] = await db
    .select({
      totalXp: sql<number>`COALESCE(SUM(${dailyActivity.totalXp}), 0)`,
    })
    .from(dailyActivity)
    .where(eq(dailyActivity.userId, userId));

  const [userStreakResult] = await db
    .select({ longestStreak: users.longestStreak })
    .from(users)
    .where(eq(users.id, userId));

  const [userPracticeResult] = await db
    .select({
      avgScore: sql<number | null>`AVG(${practiceAttempts.score})`,
      attemptCount: sql<number>`COUNT(*)`,
    })
    .from(practiceAttempts)
    .where(
      and(
        eq(practiceAttempts.userId, userId),
        sql`${practiceAttempts.completedAt} IS NOT NULL`
      )
    );

  const userTotalXp = Number(userXPResult?.totalXp ?? 0);
  const userLongestStreak = userStreakResult?.longestStreak ?? 0;
  const userAvgScore =
    userPracticeResult?.avgScore != null
      ? Number(userPracticeResult.avgScore)
      : null;
  const userAttemptCount = Number(userPracticeResult?.attemptCount ?? 0);

  // Step 3: Count students below user for each dimension
  const rankings: CohortRanking[] = [];

  // Dimension: Total XP
  const xpBelowRows = await db.execute(sql`
    SELECT COUNT(*) AS below
    FROM (
      SELECT da.user_id, SUM(da.total_xp) AS total
      FROM daily_activity da
      INNER JOIN users u ON u.id = da.user_id
      WHERE u.role = 'student' AND u.deleted_at IS NULL
      GROUP BY da.user_id
    ) cohort
    WHERE cohort.total < ${userTotalXp}
  `);
  const xpBelow = Number(xpBelowRows.rows[0]?.below ?? 0);
  const xpPercentile =
    totalActiveStudents > 0 ? (xpBelow / totalActiveStudents) * 100 : 0;

  rankings.push({
    dimension: "totalXp",
    label: "Total XP",
    userValue: userTotalXp,
    percentileBucket: percentileToBucket(xpPercentile),
    totalStudents: totalActiveStudents,
  });

  // Dimension: Longest Streak
  const streakBelowRows = await db.execute(sql`
    SELECT COUNT(*) AS below FROM (
      SELECT u.id
      FROM users u
      INNER JOIN daily_activity da ON da.user_id = u.id
      WHERE u.role = 'student' AND u.deleted_at IS NULL
        AND u.longest_streak < ${userLongestStreak}
      GROUP BY u.id
      HAVING COUNT(da.id) >= 1
    ) sub
  `);
  const streakBelow = Number(streakBelowRows.rows[0]?.below ?? 0);
  const streakPercentile =
    totalActiveStudents > 0
      ? (streakBelow / totalActiveStudents) * 100
      : 0;

  rankings.push({
    dimension: "longestStreak",
    label: "Longest Streak",
    userValue: userLongestStreak,
    percentileBucket: percentileToBucket(streakPercentile),
    totalStudents: totalActiveStudents,
  });

  // Dimension: Average Practice Score (only if user has >= 3 completed attempts)
  if (userAttemptCount >= 3 && userAvgScore !== null) {
    // Count students with >= 3 completed attempts who have a lower average score
    const practiceCohortRows = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE sub.avg_score < ${userAvgScore}) AS below,
        COUNT(*) AS cohort_total
      FROM (
        SELECT pa.user_id, AVG(pa.score) AS avg_score
        FROM practice_attempts pa
        INNER JOIN users u ON u.id = pa.user_id
        WHERE pa.completed_at IS NOT NULL
          AND u.role = 'student' AND u.deleted_at IS NULL
        GROUP BY pa.user_id
        HAVING COUNT(*) >= 3
      ) sub
    `);

    const practiceBelow = Number(
      practiceCohortRows.rows[0]?.below ?? 0
    );
    const practiceCohortTotal = Number(
      practiceCohortRows.rows[0]?.cohort_total ?? 0
    );
    const practicePercentile =
      practiceCohortTotal > 0
        ? (practiceBelow / practiceCohortTotal) * 100
        : 0;

    rankings.push({
      dimension: "avgPracticeScore",
      label: "Average Practice Score",
      userValue: Math.round(userAvgScore * 10) / 10,
      percentileBucket: percentileToBucket(practicePercentile),
      totalStudents: practiceCohortTotal,
    });
  }

  return rankings;
}
