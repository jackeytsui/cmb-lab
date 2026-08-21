import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryLessons,
  courseLibraryModules,
  threadAssignments,
} from "@/db/schema";
import { and, eq, isNull, or, inArray } from "drizzle-orm";
import { getStudentAssignmentTargets } from "@/lib/student-assignment-targets";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

type ThreadViewer = {
  id: string;
  role?: string | null;
};

/** Whether a viewer may play and submit responses to a video thread. */
export async function canUserAccessVideoThread(
  user: ThreadViewer,
  threadId: string,
  courseLibraryLessonId?: string | null,
): Promise<boolean> {
  if (user.role === "admin" || user.role === "coach") return true;

  if (courseLibraryLessonId) {
    const [lesson] = await db
      .select({
        content: courseLibraryLessons.content,
        courseId: courseLibraryCourses.id,
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
          eq(courseLibraryLessons.id, courseLibraryLessonId),
          eq(courseLibraryLessons.lessonType, "video_thread"),
          eq(courseLibraryCourses.status, "published"),
          isNull(courseLibraryLessons.deletedAt),
          isNull(courseLibraryModules.deletedAt),
          isNull(courseLibraryCourses.deletedAt),
        ),
      )
      .limit(1);

    const content = lesson?.content;
    const embeddedThreadId =
      content && typeof content === "object" && "threadId" in content
        ? (content as { threadId?: unknown }).threadId
        : null;

    if (lesson && embeddedThreadId === threadId) {
      const canSeeCourse = await getCourseLibraryCourseAccess(user);
      if (canSeeCourse(lesson.courseId)) return true;
    }
  }

  const targets = await getStudentAssignmentTargets(user.id);
  const grouped = new Map<string, string[]>();
  for (const target of targets) {
    const ids = grouped.get(target.type) ?? [];
    ids.push(target.id);
    grouped.set(target.type, ids);
  }
  const targetConditions = [...grouped].map(([type, ids]) =>
    and(
      eq(
        threadAssignments.targetType,
        type as "course" | "module" | "lesson" | "student" | "tag",
      ),
      inArray(threadAssignments.targetId, ids),
    ),
  );
  if (targetConditions.length === 0) return false;

  const [assignment] = await db
    .select({ id: threadAssignments.id })
    .from(threadAssignments)
    .where(
      and(
        eq(threadAssignments.threadId, threadId),
        or(...targetConditions),
      ),
    )
    .limit(1);

  return Boolean(assignment);
}
