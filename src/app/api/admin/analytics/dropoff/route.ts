import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { db } from "@/db";
import {
  lessons,
  modules,
  courses,
  lessonProgress,
} from "@/db/schema";
import { sql, and, isNull, isNotNull, gte, lte, eq } from "drizzle-orm";

/**
 * Get lesson drop-off data.
 * Returns lessons ranked by the rate at which students start but don't complete them.
 */
export async function getDropoffData(
  from: Date | null,
  to: Date | null,
  limit: number = 20
) {
  // Build date filter conditions on lessonProgress.startedAt
  const dateConditions = [];
  if (from) dateConditions.push(gte(lessonProgress.startedAt, from));
  if (to) dateConditions.push(lte(lessonProgress.startedAt, to));

  // Query: for each lesson, count started vs completed
  const results = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      startedCount: sql<number>`COUNT(*)`.as("started_count"),
      completedCount:
        sql<number>`COUNT(${lessonProgress.completedAt})`.as("completed_count"),
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        isNotNull(lessonProgress.startedAt),
        ...(dateConditions.length > 0 ? dateConditions : [])
      )
    )
    .groupBy(lessons.id, lessons.title, modules.title, courses.title)
    .orderBy(
      sql`(COUNT(*) - COUNT(${lessonProgress.completedAt}))::float / NULLIF(COUNT(*), 0) DESC`
    )
    .limit(limit);

  return results.map((row) => {
    const started = Number(row.startedCount);
    const completed = Number(row.completedCount);
    const dropoffCount = started - completed;
    const dropoffRate =
      started > 0
        ? Math.round((dropoffCount / started) * 1000) / 10
        : 0;

    return {
      lessonId: row.lessonId,
      lessonTitle: row.lessonTitle,
      moduleTitle: row.moduleTitle,
      courseTitle: row.courseTitle,
      startedCount: started,
      completedCount: completed,
      dropoffCount,
      dropoffRate,
    };
  });
}

/**
 * GET /api/admin/analytics/dropoff
 * Returns lessons ranked by drop-off frequency.
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
    const limit = parseInt(searchParams.get("limit") || "20") || 20;
    const data = await getDropoffData(from, to, limit);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching dropoff analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch dropoff analytics" },
      { status: 500 }
    );
  }
}
