// src/lib/ghl/milestones.ts
// Milestone detection service -- detects module/course completion and milestone lessons,
// then dispatches outbound webhook events to GHL.

import { db } from "@/db";
import {
  lessons,
  modules,
  courses,
  lessonProgress,
  ghlFieldMappings,
} from "@/db/schema";
import { eq, and, isNull, isNotNull, like } from "drizzle-orm";
import { checkCourseCompletion } from "@/lib/certificates";
import { dispatchWebhook } from "@/lib/ghl/webhooks";

// ---------------------------------------------------------------------------
// Module completion check
// ---------------------------------------------------------------------------

/**
 * Check if a user has completed all non-deleted lessons in a module.
 * Mirrors the pattern from checkCourseCompletion in certificates.ts.
 */
export async function checkModuleCompletion(
  userId: string,
  moduleId: string
): Promise<boolean> {
  // Get all non-deleted lessons in the module
  const allLessons = await db
    .select({ id: lessons.id })
    .from(lessons)
    .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)));

  if (allLessons.length === 0) {
    return false; // No lessons means not completable
  }

  // Get completed lessons for this user in this module
  const completedLessons = await db
    .select({ id: lessonProgress.lessonId })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessons.moduleId, moduleId),
        isNull(lessons.deletedAt),
        isNotNull(lessonProgress.completedAt)
      )
    );

  return completedLessons.length >= allLessons.length;
}

// ---------------------------------------------------------------------------
// Milestone lesson IDs (admin-configurable via ghl_field_mappings)
// ---------------------------------------------------------------------------

let cachedMilestoneLessonIds: string[] | null = null;
let cacheExpiresAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get lesson IDs that are configured as milestones.
 * Queries ghl_field_mappings for entries where lmsConcept starts with 'milestone_lesson:'.
 * Results are cached in-memory for 5 minutes.
 */
export async function getMilestoneLessonIds(): Promise<string[]> {
  const now = Date.now();

  if (cachedMilestoneLessonIds !== null && now < cacheExpiresAt) {
    return cachedMilestoneLessonIds;
  }

  const rows = await db
    .select({ lmsConcept: ghlFieldMappings.lmsConcept })
    .from(ghlFieldMappings)
    .where(
      and(
        like(ghlFieldMappings.lmsConcept, "milestone_lesson:%"),
        eq(ghlFieldMappings.isActive, true)
      )
    );

  const lessonIds = rows
    .map((row) => {
      const parts = row.lmsConcept.split(":");
      return parts.length > 1 ? parts[1] : null;
    })
    .filter((id): id is string => id !== null && id.length > 0);

  cachedMilestoneLessonIds = lessonIds;
  cacheExpiresAt = now + CACHE_TTL_MS;

  return lessonIds;
}

// ---------------------------------------------------------------------------
// Main entry point -- called from progress route after lesson completion
// ---------------------------------------------------------------------------

/**
 * Detect and dispatch milestone webhooks after a lesson is newly completed.
 * Checks: milestone lesson, module completion, course completion.
 * Each dispatch is fire-and-forget (errors logged, not thrown).
 */
export async function detectAndDispatchMilestones(
  userId: string,
  lessonId: string
): Promise<void> {
  // Step 1: Look up the lesson with its module and course
  const lessonRow = await db
    .select({
      lessonTitle: lessons.title,
      moduleId: lessons.moduleId,
      moduleTitle: modules.title,
      courseId: modules.courseId,
      courseTitle: courses.title,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(lessons.id, lessonId))
    .limit(1);

  if (lessonRow.length === 0) {
    console.warn(
      `[GHL Milestones] Lesson ${lessonId} not found, skipping milestone detection`
    );
    return;
  }

  const { lessonTitle, moduleId, moduleTitle, courseId, courseTitle } =
    lessonRow[0];

  // Step 2: Check if this is a milestone lesson
  const milestoneLessonIds = await getMilestoneLessonIds();
  if (milestoneLessonIds.includes(lessonId)) {
    try {
      await dispatchWebhook({
        userId,
        eventType: "lesson.milestone",
        entityType: "lesson",
        entityId: lessonId,
        context: {
          lessonTitle,
          moduleTitle,
          courseTitle,
        },
      });
    } catch (error) {
      console.error(
        `[GHL Milestones] Failed to dispatch lesson.milestone for ${lessonId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  // Step 3: Check module completion
  try {
    const moduleComplete = await checkModuleCompletion(userId, moduleId);
    if (moduleComplete) {
      // Count total lessons in module for context
      const totalLessons = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(
          and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt))
        );

      await dispatchWebhook({
        userId,
        eventType: "module.completed",
        entityType: "module",
        entityId: moduleId,
        context: {
          moduleTitle,
          courseTitle,
          totalLessons: totalLessons.length,
        },
      });
    }
  } catch (error) {
    console.error(
      `[GHL Milestones] Failed to dispatch module.completed for ${moduleId}:`,
      error instanceof Error ? error.message : error
    );
  }

  // Step 4: Check course completion
  try {
    const courseComplete = await checkCourseCompletion(userId, courseId);
    if (courseComplete) {
      // Count total modules and lessons for context
      const totalModules = await db
        .select({ id: modules.id })
        .from(modules)
        .where(
          and(eq(modules.courseId, courseId), isNull(modules.deletedAt))
        );

      const totalLessons = await db
        .select({ id: lessons.id })
        .from(lessons)
        .innerJoin(modules, eq(lessons.moduleId, modules.id))
        .where(
          and(
            eq(modules.courseId, courseId),
            isNull(modules.deletedAt),
            isNull(lessons.deletedAt)
          )
        );

      await dispatchWebhook({
        userId,
        eventType: "course.completed",
        entityType: "course",
        entityId: courseId,
        context: {
          courseTitle,
          totalModules: totalModules.length,
          totalLessons: totalLessons.length,
          completionDate: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error(
      `[GHL Milestones] Failed to dispatch course.completed for ${courseId}:`,
      error instanceof Error ? error.message : error
    );
  }
}
