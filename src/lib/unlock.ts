import { db } from "@/db";
import { lessons, lessonProgress } from "@/db/schema";
import { eq, and, lt, gt, desc, asc, isNull } from "drizzle-orm";

/**
 * Unlock status for a lesson.
 * Used to determine if a user can access a lesson in a linear progression model.
 */
export interface UnlockStatus {
  /** Whether the lesson is unlocked for the user */
  isUnlocked: boolean;
  /** Reason for the unlock status */
  reason: "first_lesson" | "previous_complete" | "previous_incomplete";
  /** ID of the previous lesson (if applicable) */
  previousLessonId?: string;
  /** Title of the previous lesson (for display in lock UI) */
  previousLessonTitle?: string;
}

/**
 * Check if a lesson is unlocked for a user.
 *
 * Linear progression rules:
 * 1. First lesson in a module is always unlocked
 * 2. Subsequent lessons require the previous lesson to have completedAt timestamp
 *
 * @param userId - Internal user ID
 * @param lessonId - Lesson ID to check
 * @returns UnlockStatus with unlock state and reason
 *
 * @example
 * ```ts
 * const status = await checkLessonUnlock(userId, lessonId);
 * if (!status.isUnlocked) {
 *   // Show lock UI with previousLessonTitle
 *   console.log(`Complete "${status.previousLessonTitle}" first`);
 * }
 * ```
 */
export async function checkLessonUnlock(
  userId: string,
  lessonId: string
): Promise<UnlockStatus> {
  // Query the target lesson to get its module and sort order
  const targetLesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    columns: { id: true, moduleId: true, sortOrder: true },
  });

  // If lesson not found, return locked (defensive)
  if (!targetLesson) {
    return { isUnlocked: false, reason: "previous_incomplete" };
  }

  // Find the previous lesson in the same module
  // (same moduleId, lower sortOrder, highest sortOrder among those)
  const previousLesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.moduleId, targetLesson.moduleId),
      lt(lessons.sortOrder, targetLesson.sortOrder)
    ),
    orderBy: [desc(lessons.sortOrder)],
    columns: { id: true, title: true },
  });

  // If no previous lesson, this is the first in module - always unlocked
  if (!previousLesson) {
    return { isUnlocked: true, reason: "first_lesson" };
  }

  // Check if previous lesson is completed for this user
  const prevProgress = await db.query.lessonProgress.findFirst({
    where: and(
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.lessonId, previousLesson.id)
    ),
    columns: { completedAt: true },
  });

  // If previous lesson has completedAt timestamp, current lesson is unlocked
  if (prevProgress?.completedAt) {
    return { isUnlocked: true, reason: "previous_complete" };
  }

  // Previous lesson not complete - current lesson is locked
  return {
    isUnlocked: false,
    reason: "previous_incomplete",
    previousLessonId: previousLesson.id,
    previousLessonTitle: previousLesson.title,
  };
}

/**
 * Get the next lesson in the same module, ordered by sortOrder.
 *
 * Used by the celebration overlay to provide a "Next Lesson" CTA.
 * Returns null if the current lesson is the last in its module.
 *
 * @param lessonId - Current lesson ID
 * @returns Next lesson { id, title } or null
 */
export async function getNextLesson(
  lessonId: string
): Promise<{ id: string; title: string } | null> {
  // Get the current lesson's module and sort order
  const currentLesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    columns: { moduleId: true, sortOrder: true },
  });

  if (!currentLesson) return null;

  // Find the next lesson in the same module (higher sortOrder, not deleted)
  const nextLesson = await db.query.lessons.findFirst({
    where: and(
      eq(lessons.moduleId, currentLesson.moduleId),
      gt(lessons.sortOrder, currentLesson.sortOrder),
      isNull(lessons.deletedAt)
    ),
    orderBy: [asc(lessons.sortOrder)],
    columns: { id: true, title: true },
  });

  return nextLesson ?? null;
}
