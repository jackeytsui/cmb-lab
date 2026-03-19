import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { db } from "@/db";
import {
  lessons,
  modules,
  courses,
  interactions,
  interactionAttempts,
} from "@/db/schema";
import { sql, and, eq, isNull, gte, lte } from "drizzle-orm";

/**
 * Get difficulty data based on average attempts to pass interactions.
 * For each lesson with interactions, computes the average attempt number
 * at which students first got a correct answer.
 */
export async function getDifficultyData(
  from: Date | null,
  to: Date | null
) {
  // Build date conditions on interactionAttempts.createdAt
  const dateConditions = [];
  if (from) dateConditions.push(gte(interactionAttempts.createdAt, from));
  if (to) dateConditions.push(lte(interactionAttempts.createdAt, to));

  // For each interaction, get the average attempt number when students got it correct.
  // Then aggregate up to lesson level.
  const results = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      moduleTitle: modules.title,
      courseTitle: courses.title,
      interactionCount:
        sql<number>`COUNT(DISTINCT ${interactions.id})`.as("interaction_count"),
      avgAttemptsToPass:
        sql<number>`ROUND(AVG(${interactionAttempts.attemptNumber})::numeric, 1)`.as(
          "avg_attempts_to_pass"
        ),
    })
    .from(interactionAttempts)
    .innerJoin(
      interactions,
      eq(interactionAttempts.interactionId, interactions.id)
    )
    .innerJoin(lessons, eq(interactions.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        eq(interactionAttempts.isCorrect, true),
        isNull(interactions.deletedAt),
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        ...(dateConditions.length > 0 ? dateConditions : [])
      )
    )
    .groupBy(lessons.id, lessons.title, modules.title, courses.title)
    .orderBy(
      sql`AVG(${interactionAttempts.attemptNumber}) DESC`
    );

  return results.map((row) => ({
    lessonId: row.lessonId,
    lessonTitle: row.lessonTitle,
    moduleTitle: row.moduleTitle,
    courseTitle: row.courseTitle,
    interactionCount: Number(row.interactionCount),
    avgAttemptsToPass: Number(row.avgAttemptsToPass),
  }));
}

/**
 * GET /api/admin/analytics/difficulty
 * Returns lessons ranked by average attempts to pass interactions.
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
    const data = await getDifficultyData(from, to);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching difficulty analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch difficulty analytics" },
      { status: 500 }
    );
  }
}
