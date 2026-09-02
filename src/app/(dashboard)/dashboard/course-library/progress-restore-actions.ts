"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNeonSql } from "@/db";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { loadStudentCourseLibraryProgress } from "@/lib/course-library-student-progress";
import { getCourseLibraryCourseAccessPolicy } from "@/lib/tag-feature-access";
import { BLUEPRINT_COURSE_TITLES } from "@/lib/ghl/course-progress-plan";
import {
  COMPLETE_COURSE_TARGET,
  planCourseLibrarySelfRestore,
} from "@/lib/course-library-self-restore";

const restoreSelectionSchema = z.object({
  courseId: z.string().uuid(),
  target: z.union([z.string().uuid(), z.literal(COMPLETE_COURSE_TARGET)]),
});

const restoreSchema = z.array(restoreSelectionSchema).min(1).max(20);

export type ProgressRestoreResult =
  | { success: true; lessonsCompleted: number; coursesUnlocked: number }
  | { success: false; error: string };

function isTrueStudent(
  currentUser: Awaited<ReturnType<typeof getCurrentUser>>,
  realUser: Awaited<ReturnType<typeof getRealUser>>,
) {
  return Boolean(
    currentUser &&
    realUser &&
    currentUser.role === "student" &&
    realUser.role === "student" &&
    currentUser.id === realUser.id,
  );
}

function revalidateCourseLibrary(courseIds: string[]) {
  revalidatePath("/dashboard/course-library");
  for (const courseId of courseIds) {
    revalidatePath(`/course-library/${courseId}`);
  }
}

/** Apply the student's one and only forward-only migration restore. */
export async function restoreCourseLibraryProgressOnce(
  input: unknown,
): Promise<ProgressRestoreResult> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: "Choose at least one valid restore point.",
    };
  }

  const [currentUser, realUser] = await Promise.all([
    getCurrentUser(),
    getRealUser(),
  ]);
  if (!isTrueStudent(currentUser, realUser) || !currentUser) {
    return {
      success: false,
      error: "Only a signed-in student can restore their own progress.",
    };
  }

  try {
    // The existing entitlement policy remains authoritative. The sole
    // exception is a locked level in the student's own three-course Blueprint
    // roadmap, which this one-time migration restore may deliberately unlock.
    const accessPolicy = await getCourseLibraryCourseAccessPolicy(currentUser);
    const courses = await loadStudentCourseLibraryProgress(currentUser, {
      canAccessCourse: accessPolicy.canAccessCourse,
      includeLockedBlueprintRoadmap: accessPolicy.showLockedBlueprintRoadmap,
    });
    const plan = planCourseLibrarySelfRestore({
      courses,
      selections: parsed.data,
    });
    const courseIdsToUnlock = plan.selections.flatMap((selection) => {
      const course = courses.find((item) => item.id === selection.courseId);
      return course && !course.hasAccess ? [course.id] : [];
    });
    if (
      plan.missingCompletionLessonIds.length === 0 &&
      courseIdsToUnlock.length === 0
    ) {
      return {
        success: false,
        error:
          "Those choices do not move your progress forward or unlock another Blueprint level. Choose a later lesson or keep your current progress.",
      };
    }
    const restoredAt = new Date();
    const auditPayload = {
      source: "student_one_time_progress_restore",
      userId: currentUser.id,
      userEmail: currentUser.email,
      selections: plan.selections,
      lessonsCompleted: plan.missingCompletionLessonIds.length,
      courseIdsUnlocked: courseIdsToUnlock,
      forwardOnly: true,
      preservedFields: [
        "video_watched_percent",
        "quiz_score",
        "quiz_answers",
        "started_at",
        "submissions",
        "recordings",
        "notes",
      ],
      performedAt: restoredAt.toISOString(),
    };
    const sql = getNeonSql();

    // `claimed` is the single-use gate. Every later write selects from it, so
    // a second browser, a double-click, or a replay cannot change progress.
    const claimed = await sql`
      WITH claimed AS (
        INSERT INTO course_library_progress_restore_decisions
          (user_id, decision, selections)
        VALUES (
          ${currentUser.id}::uuid,
          'used',
          ${JSON.stringify(plan.selections)}::jsonb
        )
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id
      ),
      progress_rows AS (
        SELECT lesson_id
        FROM jsonb_to_recordset(${JSON.stringify(
          plan.missingCompletionLessonIds.map((lessonId) => ({
            lesson_id: lessonId,
          })),
        )}::jsonb) AS rows(lesson_id uuid)
      ),
      completed AS (
        INSERT INTO course_library_lesson_progress
          (user_id, lesson_id, completed_at, video_watched_percent, started_at, updated_at)
        SELECT
          claimed.user_id,
          progress_rows.lesson_id,
          ${restoredAt.toISOString()}::timestamptz,
          0,
          ${restoredAt.toISOString()}::timestamptz,
          NOW()
        FROM claimed
        CROSS JOIN progress_rows
        ON CONFLICT (user_id, lesson_id) DO UPDATE
        SET completed_at = COALESCE(
          course_library_lesson_progress.completed_at,
          EXCLUDED.completed_at
        ),
        updated_at = CASE
          WHEN course_library_lesson_progress.completed_at IS NULL THEN NOW()
          ELSE course_library_lesson_progress.updated_at
        END
        RETURNING lesson_id
      ),
      unlock_rows AS (
        SELECT course_id
        FROM jsonb_to_recordset(${JSON.stringify(
          courseIdsToUnlock.map((courseId) => ({ course_id: courseId })),
        )}::jsonb) AS rows(course_id uuid)
      ),
      access_granted AS (
        UPDATE course_library_courses AS course
        SET allowed_user_ids = COALESCE(course.allowed_user_ids, '[]'::jsonb)
          || jsonb_build_array(claimed.user_id::text),
          updated_at = NOW()
        FROM claimed
        CROSS JOIN unlock_rows
        WHERE course.id = unlock_rows.course_id
          AND course.deleted_at IS NULL
          AND course.status = 'published'
          AND course.title IN (
            ${BLUEPRINT_COURSE_TITLES.Foundations},
            ${BLUEPRINT_COURSE_TITLES.Intermediate},
            ${BLUEPRINT_COURSE_TITLES.Advanced}
          )
          AND NOT COALESCE(course.allowed_user_ids, '[]'::jsonb)
            @> jsonb_build_array(claimed.user_id::text)
        RETURNING course.id
      ),
      audited AS (
        INSERT INTO sync_events
          (event_type, direction, status, entity_type, entity_id, payload, processed_at)
        SELECT
          'course_library.student_progress_restore',
          'inbound',
          'completed',
          'course_library_progress_restore_decision',
          claimed.user_id::text,
          ${JSON.stringify(auditPayload)}::jsonb,
          NOW()
        FROM claimed
        RETURNING entity_id
      )
      SELECT entity_id FROM audited
    `;

    if (!Array.isArray(claimed) || claimed.length === 0) {
      return {
        success: false,
        error:
          "This one-time progress choice has already been used or dismissed.",
      };
    }

    revalidateCourseLibrary(plan.selections.map((item) => item.courseId));
    return {
      success: true,
      lessonsCompleted: plan.missingCompletionLessonIds.length,
      coursesUnlocked: courseIdsToUnlock.length,
    };
  } catch (error) {
    console.error("Failed to restore Course Library progress:", error);
    return {
      success: false,
      error:
        "We could not restore your progress. Nothing was changed; please try again.",
    };
  }
}

/** Permanently hide the offer without changing course access or progress. */
export async function dismissCourseLibraryProgressRestore(): Promise<ProgressRestoreResult> {
  const [currentUser, realUser] = await Promise.all([
    getCurrentUser(),
    getRealUser(),
  ]);
  if (!isTrueStudent(currentUser, realUser) || !currentUser) {
    return {
      success: false,
      error: "Only a signed-in student can dismiss their own progress restore.",
    };
  }

  try {
    const dismissedAt = new Date();
    const sql = getNeonSql();
    const claimed = await sql`
      WITH claimed AS (
        INSERT INTO course_library_progress_restore_decisions
          (user_id, decision, selections)
        VALUES (${currentUser.id}::uuid, 'dismissed', '[]'::jsonb)
        ON CONFLICT (user_id) DO NOTHING
        RETURNING user_id
      ),
      audited AS (
        INSERT INTO sync_events
          (event_type, direction, status, entity_type, entity_id, payload, processed_at)
        SELECT
          'course_library.student_progress_restore_dismissed',
          'inbound',
          'completed',
          'course_library_progress_restore_decision',
          claimed.user_id::text,
          ${JSON.stringify({
            source: "student_one_time_progress_restore",
            userId: currentUser.id,
            userEmail: currentUser.email,
            decision: "dismissed",
            performedAt: dismissedAt.toISOString(),
          })}::jsonb,
          NOW()
        FROM claimed
        RETURNING entity_id
      )
      SELECT entity_id FROM audited
    `;

    if (!Array.isArray(claimed) || claimed.length === 0) {
      return {
        success: false,
        error:
          "This one-time progress choice has already been used or dismissed.",
      };
    }

    revalidateCourseLibrary([]);
    return { success: true, lessonsCompleted: 0, coursesUnlocked: 0 };
  } catch (error) {
    console.error("Failed to dismiss Course Library progress restore:", error);
    return {
      success: false,
      error: "We could not dismiss this message. Please try again.",
    };
  }
}
