import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
  users,
} from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/platform-roles";
import { selectCurrentCourseProgress } from "@/lib/course-library-progress-summary";

/**
 * GET /api/coaching/student-course-progress?studentEmail=...
 *
 * Returns the learner's current Course Library progress from CMB Lab lesson
 * records. Coaches/admins may query a student; students may query themselves.
 */
export async function GET(request: NextRequest) {
  const caller = await getCurrentUser();
  if (!caller) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedEmail =
    request.nextUrl.searchParams.get("studentEmail")?.trim() || caller.email;
  const canViewOtherStudents = isStaffRole(caller.role);
  if (
    !canViewOtherStudents &&
    requestedEmail.toLocaleLowerCase() !== caller.email.toLocaleLowerCase()
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = await db.query.users.findFirst({
    where: and(ilike(users.email, requestedEmail), isNull(users.deletedAt)),
    columns: { id: true },
  });
  if (!student) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
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
        eq(courseLibraryLessonProgress.userId, student.id),
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
