import "server-only";
import { cache } from "react";
import { z } from "zod";
import { eq, and, or, isNull, gt, inArray, asc } from "drizzle-orm";
import { db } from "@/db";
import {
  userRoles,
  roles,
  roleCourses,
  roleFeatures,
  courseAccess,
  courses,
  modules,
  lessons,
  users,
  platformRoleFeatures,
} from "@/db/schema";

// ---------------------------------------------------------------------------
// Feature Key Constants & Zod Schema
// ---------------------------------------------------------------------------

export const FEATURE_KEYS = [
  "ai_conversation",
  "practice_sets",
  "dictionary_reader",
  "audio_courses",
  "listening_lab",
  "coaching_material",
  "one_on_one_coaching",
  "inner_circle_group_coaching",
  "group_coaching_schedule",
  "flashcards",
  "course_library",
  "video_threads",
  "certificates",
  "ai_chat",
  "mandarin_accelerator",
  "audio_accelerator_edition",
  "tone_mastery",
  "listening_training",
  "notepad",
  // Human review and personalised feedback for Course Library assignments.
  // This is intentionally not a default student feature: package/tier tags
  // grant it only to cohorts that include coach feedback.
  "assignment_feedback",
  // Legacy permission key retained for existing role/tag records. The support
  // widget itself is now a baseline service for every active signed-in user.
  "lab_assistant",
  // Reviewer capability: grants access to Admin > Content > Assignment
  // Submissions for text assignments ("Challenge Reviewer" role bundle).
  // Future reviewer capabilities follow the same pattern, e.g.
  // "assignment_review_audio".
  "assignment_review_text",
  "assignment_review_vocal",
  "assignment_review_diary",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const featureKeySchema = z.enum(FEATURE_KEYS);

// ---------------------------------------------------------------------------
// PermissionSet Interface
// ---------------------------------------------------------------------------

export interface PermissionSet {
  /** All course IDs the user can access (union of role grants + direct grants) */
  courseIds: Set<string>;
  /** All feature keys the user has access to */
  features: Set<string>;
  /** Per-course access tier: "preview" or "full" (highest grant wins) */
  accessTiers: Map<string, "preview" | "full">;
  /** True if any active role has allCourses=true */
  hasWildcardAccess: boolean;
  /** Module IDs with module-level grants */
  moduleGrants: Set<string>;
  /** Lesson IDs with lesson-level grants */
  lessonGrants: Set<string>;
  /** Course IDs with an actual course-level grant (not only a child grant) */
  courseGrants: Set<string>;
  /** SYNC: Check if user can access a specific course */
  canAccessCourse(courseId: string): boolean;
  /** SYNC: Check if access comes from a course-level or wildcard grant */
  hasCourseLevelAccess(courseId: string): boolean;
  /** SYNC: Check if user can access a specific module (module-level or lesson-level grant) */
  canAccessModule(moduleId: string): boolean;
  /** SYNC: Check if user can access a specific lesson (lesson-level grant) */
  canAccessLesson(lessonId: string): boolean;
  /** SYNC: Check if user can use a specific feature */
  canUseFeature(featureKey: string): boolean;
  /** SYNC: Get the access tier for a specific course */
  getAccessTier(courseId: string): "preview" | "full" | null;
  /** SYNC: Get only the course-level tier, excluding child grants */
  getCourseLevelAccessTier(courseId: string): "preview" | "full" | null;
}

// ---------------------------------------------------------------------------
// Internal Resolver (not cache-wrapped)
// ---------------------------------------------------------------------------

async function _resolvePermissions(userId: string): Promise<PermissionSet> {
  const now = new Date();

  // Step 0: Look up the user's platform role so we can merge platform-level features
  const userRecord = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });
  const platformRole = userRecord?.role ?? "student";

  // Step 1: Load active role assignments (non-expired, non-deleted roles)
  const activeAssignments = await db
    .select({
      roleId: userRoles.roleId,
      allCourses: roles.allCourses,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(
      and(
        eq(userRoles.userId, userId),
        isNull(roles.deletedAt),
        or(isNull(userRoles.expiresAt), gt(userRoles.expiresAt, now))
      )
    );

  const roleIds = activeAssignments.map((a) => a.roleId);
  const hasWildcardAccess = activeAssignments.some((a) => a.allCourses);

  // Step 2: Parallel queries (including platform role features)
  const [roleCourseRows, roleFeatureRows, directGrants, platformFeatureRows] = await Promise.all([
    // Role-based course grants (skip if no roles or wildcard covers all)
    roleIds.length > 0 && !hasWildcardAccess
      ? db
          .select({
            courseId: roleCourses.courseId,
            moduleId: roleCourses.moduleId,
            lessonId: roleCourses.lessonId,
            accessTier: roleCourses.accessTier,
          })
          .from(roleCourses)
          .where(inArray(roleCourses.roleId, roleIds))
      : Promise.resolve([] as { courseId: string; moduleId: string | null; lessonId: string | null; accessTier: "preview" | "full" }[]),

    // Role-based feature grants (skip if no roles)
    roleIds.length > 0
      ? db
          .select({ featureKey: roleFeatures.featureKey })
          .from(roleFeatures)
          .where(inArray(roleFeatures.roleId, roleIds))
      : Promise.resolve([] as { featureKey: string }[]),

    // Direct courseAccess grants (always query)
    db
      .select({
        courseId: courseAccess.courseId,
        accessTier: courseAccess.accessTier,
      })
      .from(courseAccess)
      .where(
        and(
          eq(courseAccess.userId, userId),
          or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, now))
        )
      ),

    // Platform role features (admin gets all features regardless)
    platformRole === "admin"
      ? Promise.resolve(FEATURE_KEYS.map((k) => ({ featureKey: k })))
      : db
          .select({ featureKey: platformRoleFeatures.featureKey })
          .from(platformRoleFeatures)
          .where(eq(platformRoleFeatures.role, platformRole))
          .catch(() => [] as { featureKey: string }[]),
  ]);

  // Step 3: Build PermissionSet (additive union)
  const courseIdSet = new Set<string>();
  const featureSet = new Set<string>();
  const accessTierMap = new Map<string, "preview" | "full">();
  const courseLevelAccessTierMap = new Map<string, "preview" | "full">();
  const moduleGrants = new Set<string>(); // moduleIds with module-level grants
  const lessonGrants = new Set<string>(); // lessonIds with lesson-level grants
  const courseGrants = new Set<string>(); // courseIds with course-level grants

  // Helper: merge access tier (never downgrade)
  function mergeTier(courseId: string, tier: "preview" | "full") {
    courseIdSet.add(courseId);
    const current = accessTierMap.get(courseId);
    if (!current || (current === "preview" && tier === "full")) {
      accessTierMap.set(courseId, tier);
    }
  }
  function mergeCourseLevelTier(courseId: string, tier: "preview" | "full") {
    const current = courseLevelAccessTierMap.get(courseId);
    if (!current || (current === "preview" && tier === "full")) {
      courseLevelAccessTierMap.set(courseId, tier);
    }
  }

  // Union role-based course grants (categorized by granularity)
  for (const row of roleCourseRows) {
    mergeTier(row.courseId, row.accessTier);
    if (row.moduleId === null && row.lessonId === null) {
      courseGrants.add(row.courseId);
      mergeCourseLevelTier(row.courseId, row.accessTier);
    } else if (row.moduleId !== null && row.lessonId === null) {
      // Module-level grant
      moduleGrants.add(row.moduleId);
    } else if (row.lessonId !== null) {
      // Lesson-level grant
      lessonGrants.add(row.lessonId);
    }
  }

  // Union role-based feature grants (from student tier roles)
  for (const row of roleFeatureRows) {
    featureSet.add(row.featureKey);
  }

  // Union platform role feature grants
  for (const row of platformFeatureRows) {
    featureSet.add(row.featureKey);
  }

  // Union direct courseAccess grants
  for (const row of directGrants) {
    mergeTier(row.courseId, row.accessTier);
    courseGrants.add(row.courseId);
    mergeCourseLevelTier(row.courseId, row.accessTier);
  }

  return {
    courseIds: courseIdSet,
    features: featureSet,
    accessTiers: accessTierMap,
    hasWildcardAccess,
    moduleGrants,
    lessonGrants,
    courseGrants,

    canAccessCourse(courseId: string): boolean {
      return hasWildcardAccess || courseIdSet.has(courseId);
    },

    hasCourseLevelAccess(courseId: string): boolean {
      return hasWildcardAccess || courseGrants.has(courseId);
    },

    canAccessModule(moduleId: string): boolean {
      return hasWildcardAccess || moduleGrants.has(moduleId);
    },

    canAccessLesson(lessonId: string): boolean {
      return hasWildcardAccess || lessonGrants.has(lessonId);
    },

    canUseFeature(featureKey: string): boolean {
      return featureSet.has(featureKey);
    },

    getAccessTier(courseId: string): "preview" | "full" | null {
      if (hasWildcardAccess) return "full";
      return accessTierMap.get(courseId) ?? null;
    },

    getCourseLevelAccessTier(courseId: string): "preview" | "full" | null {
      if (hasWildcardAccess) return "full";
      return courseLevelAccessTierMap.get(courseId) ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Exported cache()-wrapped resolver (per-request deduplication via React 19)
// ---------------------------------------------------------------------------

export const resolvePermissions = cache(_resolvePermissions);

// ---------------------------------------------------------------------------
// Async Helper Functions (standalone, not PermissionSet methods)
// ---------------------------------------------------------------------------

async function getPreviewLessons(courseId: string) {
  const course = await db.query.courses.findFirst({
    where: and(eq(courses.id, courseId), isNull(courses.deletedAt)),
    columns: { previewLessonCount: true },
  });
  const previewLessonCount = Math.max(0, course?.previewLessonCount ?? 0);
  if (previewLessonCount === 0) return [];

  return db
    .select({ id: lessons.id, moduleId: lessons.moduleId })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(modules.courseId, courseId),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt),
      ),
    )
    .orderBy(asc(modules.sortOrder), asc(lessons.sortOrder))
    .limit(previewLessonCount);
}

/**
 * Check if a user can access a specific module.
 * Returns true if a module-level grant exists OR if the parent course is accessible.
 * Returns false if the module does not exist.
 */
export async function canAccessModule(
  permissions: PermissionSet,
  moduleId: string
): Promise<boolean> {
  // Check sync module-level grant first (avoids DB lookup)
  if (permissions.canAccessModule(moduleId)) return true;

  const mod = await db.query.modules.findFirst({
    where: eq(modules.id, moduleId),
    columns: { courseId: true },
  });

  if (!mod) return false;
  if (!permissions.hasCourseLevelAccess(mod.courseId)) return false;
  if (permissions.getCourseLevelAccessTier(mod.courseId) !== "preview") return true;
  const previewLessons = await getPreviewLessons(mod.courseId);
  return previewLessons.some((lesson) => lesson.moduleId === moduleId);
}

/**
 * Check if a user can access a specific lesson.
 * Returns true if a lesson-level grant exists, OR if the parent module is accessible,
 * OR if the parent course is accessible.
 * Returns false if the lesson does not exist.
 */
export async function canAccessLesson(
  permissions: PermissionSet,
  lessonId: string
): Promise<boolean> {
  // Check sync lesson-level grant first (avoids DB lookup)
  if (permissions.canAccessLesson(lessonId)) return true;

  const lesson = await db.query.lessons.findFirst({
    where: eq(lessons.id, lessonId),
    with: { module: { columns: { id: true, courseId: true } } },
  });

  if (!lesson) return false;
  // Check module-level grant, then course-level grant
  if (permissions.canAccessModule(lesson.module.id)) return true;
  const courseId = lesson.module.courseId;
  if (!permissions.hasCourseLevelAccess(courseId)) return false;

  // Preview course grants expose only the configured number of lessons,
  // ordered consistently with the course page. Full and wildcard grants keep
  // their existing unrestricted behavior.
  if (permissions.getCourseLevelAccessTier(courseId) !== "preview") return true;

  const previewLessons = await getPreviewLessons(courseId);
  return previewLessons.some((previewLesson) => previewLesson.id === lessonId);
}
