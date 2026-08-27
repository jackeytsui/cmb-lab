import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { selectCurrentCourseProgress } from "@/lib/course-library-progress-summary";
import { getCoachingStudentAccess } from "@/lib/coaching-student-access";

/**
 * GET /api/coaching/student-course-progress?studentEmail=...
 *
 * Returns the learner's current Course Library progress from CMB Lab lesson
 * records. Coaches/admins may query a student; students may query themselves.
 */
export async function GET(request: NextRequest) {
  const access = await getCoachingStudentAccess(
    request.nextUrl.searchParams.get("studentEmail"),
  );
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const rows = await db
    .select({
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
      courseSortOrder: courseLibraryCourses.sortOrder,
      moduleTitle: courseLibraryModules.title,
      moduleSortOrder: courseLibraryModules.sortOrder,
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      lessonSortOrder: courseLibraryLessons.sortOrder,
      progressId: courseLibraryLessonProgress.id,
      completedAt: courseLibraryLessonProgress.completedAt,
      progressUpdatedAt: courseLibraryLessonProgress.updatedAt,
    })
    .from(courseLibraryCourses)
    .innerJoin(
      courseLibraryModules,
      and(
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
        isNull(courseLibraryModules.deletedAt),
      ),
    )
    .innerJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .leftJoin(
      courseLibraryLessonProgress,
      and(
        eq(
          courseLibraryLessonProgress.lessonId,
          courseLibraryLessons.id,
        ),
        eq(courseLibraryLessonProgress.userId, access.student.id),
      ),
    )
    .where(
      and(
        isNull(courseLibraryCourses.deletedAt),
        eq(courseLibraryCourses.status, "published"),
      ),
    )
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      asc(courseLibraryModules.sortOrder),
      asc(courseLibraryLessons.sortOrder),
    );

  return NextResponse.json({
    progress: selectCurrentCourseProgress(rows),
  });
}
