import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { db } from "@/db";
import {
  users,
  lessonProgress,
  featureEngagementEvents,
} from "@/db/schema";
import { eq, sql, and, gte, lte, isNull } from "drizzle-orm";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

/**
 * Get overview analytics data.
 * Returns active/inactive student metrics for dashboard overview.
 */
export async function getOverviewData(
  from: Date | null,
  to: Date | null
) {
  // Default: active within last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const activeThreshold = from ?? sevenDaysAgo;
  const upperBound = to ?? null;

  // Total students (excluding deleted + analytics whitelist)
  const totalStudentsResult = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(users)
    .where(and(eq(users.role, "student"), isNull(users.deletedAt), excludeWhitelistedUsersSql(users.id)));

  // Aggregate last activity from lesson progress + feature engagement events.
  const activityRows = await db
    .select({
      userId: users.id,
      lastLesson: sql<Date | null>`MAX(${lessonProgress.lastAccessedAt})`,
      lastEvent: sql<Date | null>`MAX(${featureEngagementEvents.createdAt})`,
    })
    .from(users)
    .leftJoin(lessonProgress, eq(lessonProgress.userId, users.id))
    .leftJoin(featureEngagementEvents, eq(featureEngagementEvents.userId, users.id))
    .where(and(eq(users.role, "student"), isNull(users.deletedAt), excludeWhitelistedUsersSql(users.id)))
    .groupBy(users.id);

  let activeStudents = 0;
  let inactiveStudentsLoggedInOnce = 0;
  let inactiveStudentsNeverLoggedIn = 0;

  for (const row of activityRows) {
    const lastLessonTs = row.lastLesson ? new Date(row.lastLesson).getTime() : 0;
    const lastEventTs = row.lastEvent ? new Date(row.lastEvent).getTime() : 0;
    const lastActivityTs = Math.max(lastLessonTs, lastEventTs);
    if (!lastActivityTs) {
      inactiveStudentsNeverLoggedIn += 1;
      continue;
    }

    const isAfterLower = lastActivityTs >= activeThreshold.getTime();
    const isBeforeUpper = upperBound ? lastActivityTs <= upperBound.getTime() : true;
    if (isAfterLower && isBeforeUpper) {
      activeStudents += 1;
    } else {
      inactiveStudentsLoggedInOnce += 1;
    }
  }

  return {
    activeStudents: Number(activeStudents),
    totalStudents: Number(totalStudentsResult[0]?.count || 0),
    inactiveStudentsLoggedInOnce: Number(inactiveStudentsLoggedInOnce),
    inactiveStudentsNeverLoggedIn: Number(inactiveStudentsNeverLoggedIn),
  };
}

/**
 * GET /api/admin/analytics/overview
 * Returns high-level platform metrics.
 */
export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const { from, to } = parseDateRange(searchParams);
    const data = await getOverviewData(from, to);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching overview analytics:", error);
    return NextResponse.json(
      {
        activeStudents: 0,
        totalStudents: 0,
        inactiveStudentsLoggedInOnce: 0,
        inactiveStudentsNeverLoggedIn: 0,
      },
      { status: 200 }
    );
  }
}
