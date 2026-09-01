"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, getNeonSql } from "@/db";
import { courseLibraryCourses, courseLibraryModules } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { canUserAccessCourseLibraryModule } from "@/lib/course-library-lesson-access";
import { getCourseLibraryCourseAccess } from "@/lib/tag-feature-access";

const moduleIdSchema = z.string().uuid();

export type JumpAheadResult =
  | { success: true; href: string }
  | { success: false; error: string };

/** Grant the effective student access to exactly one roadmap module. */
export async function jumpAheadToCourseLibraryModule(
  moduleId: string,
): Promise<JumpAheadResult> {
  const parsedModuleId = moduleIdSchema.safeParse(moduleId);
  if (!parsedModuleId.success) {
    return { success: false, error: "That course stop is not available." };
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return { success: false, error: "Please sign in again to continue." };
  }

  const [target] = await db
    .select({
      moduleId: courseLibraryModules.id,
      moduleTitle: courseLibraryModules.title,
      courseId: courseLibraryCourses.id,
      courseTitle: courseLibraryCourses.title,
    })
    .from(courseLibraryModules)
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryModules.id, parsedModuleId.data),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(currentUser.role),
        ),
      ),
    )
    .limit(1);

  if (!target) {
    return { success: false, error: "That course stop is not available." };
  }

  const canSeeCourse = await getCourseLibraryCourseAccess(currentUser);
  if (!canSeeCourse(target.courseId)) {
    return { success: false, error: "You do not have access to that course." };
  }

  const href = `/course-library/${target.courseId}/modules/${target.moduleId}`;
  if (await canUserAccessCourseLibraryModule(currentUser, target.moduleId)) {
    return { success: true, href };
  }

  const auditPayload = {
    source: "student_jump_confirmation",
    userId: currentUser.id,
    userEmail: currentUser.email,
    courseId: target.courseId,
    courseTitle: target.courseTitle,
    moduleId: target.moduleId,
    moduleTitle: target.moduleTitle,
    preservesLessonCompletion: true,
  };

  try {
    // One data-modifying CTE keeps the grant and its audit event atomic. The
    // unique index makes repeat confirmations safe and prevents duplicates.
    const sql = getNeonSql();
    await sql`
      WITH granted AS (
        INSERT INTO course_library_module_jump_grants (user_id, module_id)
        VALUES (${currentUser.id}::uuid, ${target.moduleId}::uuid)
        ON CONFLICT (user_id, module_id) DO NOTHING
        RETURNING id
      )
      INSERT INTO sync_events
        (event_type, direction, status, entity_type, entity_id, payload, processed_at)
      SELECT
        'course_library.student_jump',
        'inbound',
        'completed',
        'course_library_module_jump_grant',
        ${currentUser.id},
        ${JSON.stringify(auditPayload)}::jsonb,
        NOW()
      FROM granted
    `;

    revalidatePath(`/course-library/${target.courseId}`);
    return { success: true, href };
  } catch (error) {
    console.error("Failed to grant Course Library jump access:", error);
    return {
      success: false,
      error: "We could not open that stop. Please try again.",
    };
  }
}
