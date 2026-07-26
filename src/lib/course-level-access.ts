// ---------------------------------------------------------------------------
// Hard cross-course level locking for the Course Library.
//
// Rule: Intermediate is locked until the Foundations course is 100% complete;
// Advanced is locked until Intermediate is complete. Staff (coach/admin)
// always bypass. A per-student unlock grant (course_library_level_unlocks —
// created by the team from Admin → Students, or once per student by the Lab
// Assistant) opens a level early.
//
// Every grant/revoke is mirrored to GoHighLevel as a contact tag
// ("CMB Level Unlocked: Intermediate") so the team sees unlock state in GHL.
//
// Fail-open by design: if the previous-level course can't be found (renamed,
// unpublished) or has no lessons, students are NOT locked out — a
// misconfigured title should never brick the library.
// ---------------------------------------------------------------------------

import { db } from "@/db";
import {
  courseLibraryCourses,
  courseLibraryModules,
  courseLibraryLessons,
  courseLibraryLessonProgress,
  courseLibraryLevelUnlocks,
  type CourseLibraryLevelUnlockSource,
} from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  GATED_LEVELS,
  getCourseLevelInfo,
  ghlLevelUnlockTag,
  levelLabel,
  type CourseLevelKey,
  type GatedCourseLevelKey,
} from "@/lib/course-library-levels";
import { syncTagToGhl } from "@/lib/ghl/tag-sync";

interface LockCheckUser {
  id: string;
  role: string;
}

export interface CourseLevelLockStatus {
  locked: boolean;
  /** Level of the course being checked, when it's part of the sequence. */
  levelKey: CourseLevelKey | null;
  levelLabel: string | null;
  /** Previous-level course that must be finished first (when known). */
  requiredCourse: { id: string; title: string } | null;
  requiredLevelLabel: string | null;
  /** Set when the level is open because of an early-unlock grant. */
  unlockSource: CourseLibraryLevelUnlockSource | null;
}

const OPEN: CourseLevelLockStatus = {
  locked: false,
  levelKey: null,
  levelLabel: null,
  requiredCourse: null,
  requiredLevelLabel: null,
  unlockSource: null,
};

function isStaff(user: LockCheckUser | null): boolean {
  return user?.role === "admin" || user?.role === "coach";
}

/** Find the live course for a level (published/preview, not deleted). */
async function findCourseForLevel(
  level: CourseLevelKey,
): Promise<{ id: string; title: string } | null> {
  const rows = await db
    .select({ id: courseLibraryCourses.id, title: courseLibraryCourses.title })
    .from(courseLibraryCourses)
    .where(
      and(
        isNull(courseLibraryCourses.deletedAt),
        eq(courseLibraryCourses.isPublished, true),
      ),
    );
  return rows.find((row) => getCourseLevelInfo(row.title)?.key === level) ?? null;
}

/** All lessons complete for a user in a course. Empty course counts as
 *  incomplete-but-open (fail-open handled by the caller). */
async function isCourseComplete(
  userId: string,
  courseId: string,
): Promise<{ total: number; completed: number }> {
  const [row] = await db
    .select({
      total: sql<number>`COUNT(DISTINCT ${courseLibraryLessons.id})`,
      completed: sql<number>`COUNT(DISTINCT CASE WHEN ${courseLibraryLessonProgress.completedAt} IS NOT NULL THEN ${courseLibraryLessonProgress.lessonId} END)`,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .leftJoin(
      courseLibraryLessonProgress,
      and(
        eq(courseLibraryLessonProgress.lessonId, courseLibraryLessons.id),
        eq(courseLibraryLessonProgress.userId, userId),
      ),
    )
    .where(
      and(
        eq(courseLibraryModules.courseId, courseId),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryLessons.deletedAt),
      ),
    );
  return {
    total: Number(row?.total ?? 0),
    completed: Number(row?.completed ?? 0),
  };
}

/** Fetch a user's early-unlock grant for a level, if any. */
export async function getLevelUnlockGrant(
  userId: string,
  level: GatedCourseLevelKey,
) {
  return db.query.courseLibraryLevelUnlocks.findFirst({
    where: and(
      eq(courseLibraryLevelUnlocks.userId, userId),
      eq(courseLibraryLevelUnlocks.level, level),
    ),
  });
}

/**
 * Hard-lock check for a course. Use on the course, module, and lesson pages;
 * a locked course should render the locked screen / redirect.
 */
export async function getCourseLevelLock(
  user: LockCheckUser | null,
  courseTitle: string,
): Promise<CourseLevelLockStatus> {
  const info = getCourseLevelInfo(courseTitle);
  if (!info) return OPEN;

  const base: CourseLevelLockStatus = {
    ...OPEN,
    levelKey: info.key,
    levelLabel: info.label,
    requiredLevelLabel: info.prevLabel,
  };

  // First level, staff, or signed-out (auth gates handle sign-in) → open.
  if (!info.prevKey || !user || isStaff(user)) return base;

  // Early-unlock grant → open.
  const grant = await getLevelUnlockGrant(
    user.id,
    info.key as GatedCourseLevelKey,
  );
  if (grant) return { ...base, unlockSource: grant.source };

  // Previous-level course must be 100% complete.
  const requiredCourse = await findCourseForLevel(info.prevKey);
  if (!requiredCourse) return base; // fail-open: no live previous course

  const progress = await isCourseComplete(user.id, requiredCourse.id);
  if (progress.total === 0) return { ...base, requiredCourse }; // fail-open

  return {
    ...base,
    requiredCourse,
    locked: progress.completed < progress.total,
  };
}

/**
 * The student's next locked level in sequence, or null when nothing is locked
 * (used by the Lab Assistant to know what an early unlock would open).
 */
export async function getNextLockedLevel(user: LockCheckUser): Promise<{
  level: GatedCourseLevelKey;
  label: string;
  course: { id: string; title: string };
  requiredCourse: { id: string; title: string } | null;
} | null> {
  for (const level of GATED_LEVELS) {
    const course = await findCourseForLevel(level);
    if (!course) continue;
    const status = await getCourseLevelLock(user, course.title);
    if (status.locked) {
      return {
        level,
        label: levelLabel(level),
        course,
        requiredCourse: status.requiredCourse,
      };
    }
  }
  return null;
}

/** True once the student has used their single assistant-granted unlock. */
export async function hasUsedAssistantUnlock(userId: string): Promise<boolean> {
  const row = await db.query.courseLibraryLevelUnlocks.findFirst({
    where: and(
      eq(courseLibraryLevelUnlocks.userId, userId),
      eq(courseLibraryLevelUnlocks.source, "assistant"),
    ),
    columns: { id: true },
  });
  return !!row;
}

/**
 * Grant an early unlock for a level. Idempotent: re-granting an unlocked
 * level returns the existing row. Mirrors a GHL contact tag fire-and-forget
 * so the unlock is visible in GoHighLevel.
 */
export async function grantLevelUnlock(params: {
  userId: string;
  level: GatedCourseLevelKey;
  source: CourseLibraryLevelUnlockSource;
  grantedBy?: string | null;
  note?: string | null;
}): Promise<{ created: boolean }> {
  const inserted = await db
    .insert(courseLibraryLevelUnlocks)
    .values({
      userId: params.userId,
      level: params.level,
      source: params.source,
      grantedBy: params.grantedBy ?? null,
      note: params.note ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: courseLibraryLevelUnlocks.id });

  const created = inserted.length > 0;
  if (created) {
    syncTagToGhl(params.userId, ghlLevelUnlockTag(params.level), "add").catch(
      (error) =>
        console.error(
          "[Level Unlock] GHL tag sync failed:",
          error instanceof Error ? error.message : error,
        ),
    );
  }
  return { created };
}

/** Revoke an early unlock (team only) and remove the mirrored GHL tag. */
export async function revokeLevelUnlock(
  userId: string,
  level: GatedCourseLevelKey,
): Promise<{ removed: boolean }> {
  const deleted = await db
    .delete(courseLibraryLevelUnlocks)
    .where(
      and(
        eq(courseLibraryLevelUnlocks.userId, userId),
        eq(courseLibraryLevelUnlocks.level, level),
      ),
    )
    .returning({ id: courseLibraryLevelUnlocks.id });

  const removed = deleted.length > 0;
  if (removed) {
    syncTagToGhl(userId, ghlLevelUnlockTag(level), "remove").catch((error) =>
      console.error(
        "[Level Unlock] GHL tag removal failed:",
        error instanceof Error ? error.message : error,
      ),
    );
  }
  return { removed };
}

/** All grants for a user (admin UI). */
export async function listLevelUnlocks(userId: string) {
  return db.query.courseLibraryLevelUnlocks.findMany({
    where: eq(courseLibraryLevelUnlocks.userId, userId),
    orderBy: (table, { asc }) => [asc(table.createdAt)],
  });
}

// Re-exported so API routes can validate level strings without reaching into
// the levels module directly.
export { GATED_LEVELS, levelLabel };
