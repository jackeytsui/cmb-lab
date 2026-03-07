import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { db } from "@/db";
import { users, lessonProgress } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

/**
 * Get at-risk student data.
 * Returns students sorted by inactivity (most inactive first).
 */
export async function getStudentsData(
  from: Date | null,
  to: Date | null,
  _daysInactive: number = 7
) {
  // Build the CASE expression for counting completed lessons with optional date filter
  let completedCountExpr;
  if (from && to) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else if (from) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} >= ${from} THEN 1 END)`;
  } else if (to) {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL AND ${lessonProgress.completedAt} <= ${to} THEN 1 END)`;
  } else {
    completedCountExpr = sql<number>`COUNT(CASE WHEN ${lessonProgress.completedAt} IS NOT NULL THEN 1 END)`;
  }

  // Get all students with their last activity and completed lesson count
  const results = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      lastActivity: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`.as(
        "last_activity"
      ),
      totalLessonsCompleted: completedCountExpr.as("total_lessons_completed"),
    })
    .from(users)
    .leftJoin(lessonProgress, eq(lessonProgress.userId, users.id))
    .where(and(eq(users.role, "student"), isNull(users.deletedAt), excludeWhitelistedUsersSql(users.id)))
    .groupBy(users.id, users.name, users.email)
    .orderBy(sql`MAX(${lessonProgress.lastAccessedAt}) ASC NULLS FIRST`);

  const now = new Date();

  return results.map((row) => {
    const lastActivity = row.lastActivity
      ? new Date(row.lastActivity)
      : null;
    const daysSinceActivity = lastActivity
      ? Math.floor(
          (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;

    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      lastActivity: lastActivity?.toISOString() || null,
      daysSinceActivity,
      totalLessonsCompleted: Number(row.totalLessonsCompleted),
    };
  });
}

/**
 * GET /api/admin/analytics/students
 * Returns at-risk students sorted by inactivity.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const { from, to } = parseDateRange(searchParams);
    const daysInactive =
      parseInt(searchParams.get("daysInactive") || "7") || 7;
    const data = await getStudentsData(from, to, daysInactive);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching student analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch student analytics" },
      { status: 500 }
    );
  }
}
