import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  courses,
  modules,
  lessons,
  courseAccess,
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
} from "@/db/schema";
import { and, eq, ilike, inArray, isNull, or, gt, sql } from "drizzle-orm";
import { sanitizeSearchQuery } from "@/lib/search-utils";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

/**
 * GET /api/search?q=term
 *
 * Search courses and lessons by keyword, Chinese characters, Pinyin, or Jyutping.
 * Results are ranked by relevance (title > pinyin/jyutping > description)
 * and filtered to only courses the authenticated user has access to.
 */
export async function GET(request: NextRequest) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
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

    const legacyCourseFields = {
      id: courses.id,
      title: courses.title,
      description: courses.description,
      type: sql<string>`'course'`,
      href: sql<string>`'/courses/' || ${courses.id}::text`,
      relevance: sql<number>`
        CASE
          WHEN ${courses.title} ILIKE ${pattern} THEN 10
          WHEN ${courses.searchPinyin} ILIKE ${pattern} THEN 5
          WHEN ${courses.searchJyutping} ILIKE ${pattern} THEN 5
          WHEN ${courses.description} ILIKE ${pattern} THEN 2
          ELSE 0
        END
      `,
    };
    const legacyCourseFilter = and(
      isNull(courses.deletedAt),
      or(
        ilike(courses.title, pattern),
        ilike(courses.description, pattern),
        ilike(courses.searchPinyin, pattern),
        ilike(courses.searchJyutping, pattern),
      ),
    );
    const isStaff = currentUser.role === "admin" || currentUser.role === "coach";

    // Staff can search every legacy course; students only see active grants.
    const courseResults = isStaff
      ? await db
          .select(legacyCourseFields)
          .from(courses)
          .where(legacyCourseFilter)
          .limit(50)
      : await db
          .select(legacyCourseFields)
          .from(courses)
          .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
          .where(
            and(
              legacyCourseFilter,
              eq(courseAccess.userId, currentUser.id),
              or(
                isNull(courseAccess.expiresAt),
                gt(courseAccess.expiresAt, new Date()),
              ),
            ),
          )
          .limit(50);

    const legacyLessonFields = {
      id: lessons.id,
      title: lessons.title,
      description: lessons.description,
      type: sql<string>`'lesson'`,
      courseId: courses.id,
      courseTitle: courses.title,
      href: sql<string>`'/courses/' || ${courses.id}::text`,
      relevance: sql<number>`
        CASE
          WHEN ${lessons.title} ILIKE ${pattern} THEN 10
          WHEN ${lessons.searchPinyin} ILIKE ${pattern} THEN 5
          WHEN ${lessons.searchJyutping} ILIKE ${pattern} THEN 5
          WHEN ${lessons.description} ILIKE ${pattern} THEN 2
          ELSE 0
        END
      `,
    };
    const legacyLessonFilter = and(
      isNull(courses.deletedAt),
      isNull(modules.deletedAt),
      isNull(lessons.deletedAt),
      or(
        ilike(lessons.title, pattern),
        ilike(lessons.description, pattern),
        ilike(lessons.searchPinyin, pattern),
        ilike(lessons.searchJyutping, pattern),
      ),
    );

    // Search lessons within visible legacy courses.
    const lessonResults = isStaff
      ? await db
          .select(legacyLessonFields)
          .from(lessons)
          .innerJoin(modules, eq(lessons.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .where(legacyLessonFilter)
          .limit(50)
      : await db
          .select(legacyLessonFields)
          .from(lessons)
          .innerJoin(modules, eq(lessons.moduleId, modules.id))
          .innerJoin(courses, eq(modules.courseId, courses.id))
          .innerJoin(courseAccess, eq(courseAccess.courseId, courses.id))
          .where(
            and(
              legacyLessonFilter,
              eq(courseAccess.userId, currentUser.id),
              or(
                isNull(courseAccess.expiresAt),
                gt(courseAccess.expiresAt, new Date()),
              ),
            ),
          )
          .limit(50);

    // Course Library uses tag/manual grants rather than legacy course_access.
    // Query visible statuses, then apply the same per-course predicate as the
    // student library so Search cannot reveal restricted course titles.
    const libraryStatuses = visibleCourseStatuses(currentUser.role);
    const canSeeLibraryCourse = await getCourseLibraryCourseAccess(currentUser);
    const libraryCourseRows = await db
      .select({
        id: courseLibraryCourses.id,
        title: courseLibraryCourses.title,
        description: courseLibraryCourses.summary,
        type: sql<string>`'course'`,
        href: sql<string>`'/dashboard/course-library/' || ${courseLibraryCourses.id}::text`,
        relevance: sql<number>`
          CASE
            WHEN ${courseLibraryCourses.title} ILIKE ${pattern} THEN 10
            WHEN ${courseLibraryCourses.summary} ILIKE ${pattern} THEN 2
            ELSE 0
          END
        `,
      })
      .from(courseLibraryCourses)
      .where(
        and(
          isNull(courseLibraryCourses.deletedAt),
          inArray(courseLibraryCourses.status, libraryStatuses),
          or(
            ilike(courseLibraryCourses.title, pattern),
            ilike(courseLibraryCourses.summary, pattern),
          ),
        ),
      )
      .limit(50);
    const libraryCourseResults = libraryCourseRows.filter((row) =>
      canSeeLibraryCourse(row.id),
    );

    const libraryLessonRows = await db
      .select({
        id: courseLibraryLessons.id,
        title: courseLibraryLessons.title,
        description: sql<string | null>`NULL`,
        type: sql<string>`'lesson'`,
        courseId: courseLibraryCourses.id,
        courseTitle: courseLibraryCourses.title,
        href: sql<string>`'/dashboard/course-library/' || ${courseLibraryCourses.id}::text`,
        relevance: sql<number>`
          CASE
            WHEN ${courseLibraryLessons.title} ILIKE ${pattern} THEN 10
            ELSE 0
          END
        `,
      })
      .from(courseLibraryLessons)
      .innerJoin(
        courseLibraryModules,
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
      )
      .innerJoin(
        courseLibraryCourses,
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
      )
      .where(
        and(
          isNull(courseLibraryCourses.deletedAt),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryLessons.deletedAt),
          inArray(courseLibraryCourses.status, libraryStatuses),
          ilike(courseLibraryLessons.title, pattern),
        ),
      )
      .limit(100);
    const libraryLessonResults = libraryLessonRows.filter((row) =>
      canSeeLibraryCourse(row.courseId),
    );

    // Combine, sort by relevance, limit to 20
    const allResults = [
      ...libraryCourseResults,
      ...libraryLessonResults,
      ...courseResults,
      ...lessonResults,
    ]
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
