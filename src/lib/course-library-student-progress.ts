import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessonProgress,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

export type StudentCourseLibraryProgressModule = {
  id: string;
  title: string;
  shortTitle: string | null;
  lessonIds: string[];
  completedLessonIds: string[];
  lessons: Array<{
    id: string;
    title: string;
    lessonType: string;
    isComplete: boolean;
  }>;
};

export type StudentCourseLibraryProgressCourse = {
  id: string;
  title: string;
  hasAccess: boolean;
  modules: StudentCourseLibraryProgressModule[];
};

type LoadStudentCourseLibraryProgressOptions = {
  /** Staff progress tools can include published courses not assigned yet. */
  includeUnassignedPublished?: boolean;
};

/**
 * Load the published Course Library courses a student can actually see,
 * together with their real CMB Lab lesson-completion records.
 *
 * This is shared by the staff chapter-unlock control and the student profile
 * summary so both surfaces use the same tag/manual/system access policy.
 */
export async function loadStudentCourseLibraryProgress(
  student: {
    id: string;
    role: string;
  },
  options: LoadStudentCourseLibraryProgressOptions = {}
): Promise<StudentCourseLibraryProgressCourse[]> {
  const canAccessCourse = await getCourseLibraryCourseAccess(student);
  const rows = await db
    .select({
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      moduleShortTitle: courseLibraryModules.shortTitle,
      lessonId: courseLibraryLessons.id,
      lessonTitle: courseLibraryLessons.title,
      lessonType: courseLibraryLessons.lessonType,
      completedAt: courseLibraryLessonProgress.completedAt,
    })
    .from(courseLibraryCourses)
    .innerJoin(
      courseLibraryModules,
      and(
        eq(courseLibraryModules.courseId, courseLibraryCourses.id),
        isNull(courseLibraryModules.deletedAt)
      )
    )
    .leftJoin(
      courseLibraryLessons,
      and(
        eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
        isNull(courseLibraryLessons.deletedAt)
      )
    )
    .leftJoin(
      courseLibraryLessonProgress,
      and(
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
        eq(courseLibraryLessonProgress.userId, student.id)
      )
    )
    .where(
      and(
        eq(courseLibraryCourses.status, "published"),
        isNull(courseLibraryCourses.deletedAt)
      )
    )
    .orderBy(
      asc(courseLibraryCourses.sortOrder),
      asc(courseLibraryCourses.title),
      asc(courseLibraryModules.sortOrder),
      asc(courseLibraryModules.title),
      asc(courseLibraryLessons.sortOrder),
      asc(courseLibraryLessons.title)
    );

  const courseMap = new Map<string, StudentCourseLibraryProgressCourse>();

  for (const row of rows) {
    const hasAccess = canAccessCourse(row.courseId);
    if (!hasAccess && !options.includeUnassignedPublished) continue;

    let course = courseMap.get(row.courseId);
    if (!course) {
      course = {
        id: row.courseId,
        title: row.courseTitle,
        hasAccess,
        modules: [],
      };
      courseMap.set(row.courseId, course);
    }

    let chapter = course.modules.find((item) => item.id === row.moduleId);
    if (!chapter) {
      chapter = {
        id: row.moduleId,
        title: row.moduleTitle,
        shortTitle: row.moduleShortTitle,
        lessonIds: [],
        completedLessonIds: [],
        lessons: [],
      };
      course.modules.push(chapter);
    }

    if (!row.lessonId) continue;
    chapter.lessonIds.push(row.lessonId);
    chapter.lessons.push({
      id: row.lessonId,
      title: row.lessonTitle ?? "Untitled lesson",
      lessonType: row.lessonType ?? "text",
      isComplete: Boolean(row.completedAt),
    });
    if (row.completedAt) chapter.completedLessonIds.push(row.lessonId);
  }

  return Array.from(courseMap.values());
}
