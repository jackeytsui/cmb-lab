import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";

export type AccessibleAudioLesson = {
  id: string;
  title: string;
  content: string | null;
  courseId: string;
  courseTitle: string;
  courseDescription: string | null;
};

/**
 * Resolve a published audio lesson and enforce the owning course entitlement.
 * All student-facing audio media, notes, and exercise routes use this helper so
 * direct API requests cannot bypass the catalogue's feature/content rules.
 */
export async function getAccessibleAudioLesson(
  user: { id: string; role: string },
  lessonId: string,
): Promise<AccessibleAudioLesson | null> {
  const [lesson] = await db
    .select({
      id: lessons.id,
      title: lessons.title,
      content: lessons.content,
      courseId: courses.id,
      courseTitle: courses.title,
      courseDescription: courses.description,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        eq(lessons.id, lessonId),
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        eq(courses.isPublished, true),
      ),
    )
    .limit(1);

  if (
    !lesson ||
    !(await userCanAccessAudioCourse(user, {
      id: lesson.courseId,
      title: lesson.courseTitle,
      description: lesson.courseDescription,
    }))
  ) {
    return null;
  }

  return lesson;
}
