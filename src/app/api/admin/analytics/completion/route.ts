import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { db } from "@/db";
import {
  courses,
  modules,
  lessons,
  courseAccess,
  lessonProgress,
} from "@/db/schema";
import { eq, sql, and, isNull, isNotNull, gte, lte } from "drizzle-orm";

/**
 * Get course completion rate data.
 * For each published course, returns total lessons, enrolled students,
 * students who completed all lessons, and completion rate.
 */
export async function getCompletionData(
  from: Date | null,
  to: Date | null
) {
  // Get all published, non-deleted courses
  const publishedCourses = await db
    .select({
      id: courses.id,
      title: courses.title,
    })
    .from(courses)
    .where(and(isNull(courses.deletedAt), eq(courses.isPublished, true)));

  const results = [];

  for (const course of publishedCourses) {
    // Count total lessons in this course (via modules -> lessons, non-deleted)
    const lessonCountResult = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, course.id),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt)
        )
      );
    const totalLessons = Number(lessonCountResult[0]?.count || 0);

    if (totalLessons === 0) continue;

    // Count enrolled students
    const enrolledResult = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${courseAccess.userId})` })
      .from(courseAccess)
      .where(eq(courseAccess.courseId, course.id));
    const enrolledStudents = Number(enrolledResult[0]?.count || 0);

    if (enrolledStudents === 0) {
      results.push({
        courseId: course.id,
        courseTitle: course.title,
        totalLessons,
        enrolledStudents: 0,
        completedStudents: 0,
        completionRate: 0,
      });
      continue;
    }

    // Count students who completed ALL lessons in the course
    // A student is "completed" if they have a non-null completedAt for every lesson in the course
    const completionConditions = [
      isNotNull(lessonProgress.completedAt),
    ];
    if (from) completionConditions.push(gte(lessonProgress.completedAt!, from));
    if (to) completionConditions.push(lte(lessonProgress.completedAt!, to));

    const completedResult = await db
      .select({
        userId: lessonProgress.userId,
        completedLessons: sql<number>`COUNT(*)`,
      })
      .from(lessonProgress)
      .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .where(
        and(
          eq(modules.courseId, course.id),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt),
          ...completionConditions
        )
      )
      .groupBy(lessonProgress.userId)
      .having(sql`COUNT(*) >= ${totalLessons}`);

    const completedStudents = completedResult.length;
    const completionRate =
      Math.round((completedStudents / enrolledStudents) * 1000) / 10;

    results.push({
      courseId: course.id,
      courseTitle: course.title,
      totalLessons,
      enrolledStudents,
      completedStudents,
      completionRate,
    });
  }

  // Sort by completion rate ascending (worst first)
  results.sort((a, b) => a.completionRate - b.completionRate);

  return results;
}

/**
 * GET /api/admin/analytics/completion
 * Returns per-course completion rates.
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
    const data = await getCompletionData(from, to);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching completion analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch completion analytics" },
      { status: 500 }
    );
  }
}
