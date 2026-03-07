import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courses, modules, lessons, courseAccess, users } from "@/db/schema";
import { and, eq, ilike, isNull, or, gt, sql } from "drizzle-orm";
import { sanitizeSearchQuery } from "@/lib/search-utils";

/**
 * GET /api/search?q=term
 *
 * Search courses and lessons by keyword, Chinese characters, Pinyin, or Jyutping.
 * Results are ranked by relevance (title > pinyin/jyutping > description)
 * and filtered to only courses the authenticated user has access to.
 */
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q");

    // Require at least 2 characters
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const sanitized = sanitizeSearchQuery(q);
    const pattern = `%${sanitized}%`;

    // Search courses the user has access to
    const courseResults = await db
      .select({
        id: courses.id,
        title: courses.title,
        description: courses.description,
        type: sql<string>`'course'`,
        relevance: sql<number>`
          CASE
            WHEN ${courses.title} ILIKE ${pattern} THEN 10
            WHEN ${courses.searchPinyin} ILIKE ${pattern} THEN 5
            WHEN ${courses.searchJyutping} ILIKE ${pattern} THEN 5
            WHEN ${courses.description} ILIKE ${pattern} THEN 2
            ELSE 0
          END
        `,
      })
      .from(courses)
      .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
      .innerJoin(users, eq(courseAccess.userId, users.id))
      .where(
        and(
          eq(users.clerkId, clerkId),
          isNull(courses.deletedAt),
          or(
            isNull(courseAccess.expiresAt),
            gt(courseAccess.expiresAt, new Date())
          ),
          or(
            ilike(courses.title, pattern),
            ilike(courses.description, pattern),
            ilike(courses.searchPinyin, pattern),
            ilike(courses.searchJyutping, pattern)
          )
        )
      );

    // Search lessons within enrolled courses
    const lessonResults = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        description: lessons.description,
        type: sql<string>`'lesson'`,
        courseId: courses.id,
        courseTitle: courses.title,
        relevance: sql<number>`
          CASE
            WHEN ${lessons.title} ILIKE ${pattern} THEN 10
            WHEN ${lessons.searchPinyin} ILIKE ${pattern} THEN 5
            WHEN ${lessons.searchJyutping} ILIKE ${pattern} THEN 5
            WHEN ${lessons.description} ILIKE ${pattern} THEN 2
            ELSE 0
          END
        `,
      })
      .from(lessons)
      .innerJoin(modules, eq(lessons.moduleId, modules.id))
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
      .innerJoin(users, eq(courseAccess.userId, users.id))
      .where(
        and(
          eq(users.clerkId, clerkId),
          isNull(courses.deletedAt),
          isNull(modules.deletedAt),
          isNull(lessons.deletedAt),
          or(
            isNull(courseAccess.expiresAt),
            gt(courseAccess.expiresAt, new Date())
          ),
          or(
            ilike(lessons.title, pattern),
            ilike(lessons.description, pattern),
            ilike(lessons.searchPinyin, pattern),
            ilike(lessons.searchJyutping, pattern)
          )
        )
      );

    // Combine, sort by relevance, limit to 20
    const allResults = [...courseResults, ...lessonResults]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 20);

    return NextResponse.json({ results: allResults, query: q.trim() });
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Failed to search" },
      { status: 500 }
    );
  }
}
