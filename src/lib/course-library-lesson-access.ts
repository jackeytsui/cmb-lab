import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

type CourseLibraryViewer = {
  id: string;
  role?: string | null;
};

/** Apply course status, deletion, tag, and manual-grant rules to a lesson. */
export async function canUserAccessCourseLibraryLesson(
  user: CourseLibraryViewer,
  lessonId: string,
): Promise<boolean> {
  const [lesson] = await db
    .select({ courseId: courseLibraryCourses.id })
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
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(user.role),
        ),
      ),
    )
    .limit(1);

  if (!lesson) return false;
  const canSeeCourse = await getCourseLibraryCourseAccess(user);
  return canSeeCourse(lesson.courseId);
}
