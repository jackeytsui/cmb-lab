import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { roleCourses } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { z } from "zod";

const schema = z.object({
  courseId: z.string().uuid(),
  moduleId: z.string().uuid().nullable(),
  lessonId: z.string().uuid().nullable(),
  granted: z.boolean(),
});

/**
 * PUT /api/admin/roles/:roleId/courses
 * Grant or revoke a course/module/lesson permission for a role.
 * Uses delete-then-insert pattern to handle NULL uniqueness.
 * Requires coach role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleId } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { courseId, moduleId, lessonId, granted } = parsed.data;

    if (!granted) {
      // REVOKE permission
      if (moduleId === null && lessonId === null) {
        // Course-level revoke: delete ALL rows for this role+course (any granularity)
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId)
            )
          );
      } else if (moduleId !== null && lessonId === null) {
        // Module-level revoke: delete module-level and all lesson-level rows for this module
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId),
              eq(roleCourses.moduleId, moduleId)
            )
          );
      } else if (lessonId !== null) {
        // Lesson-level revoke: delete specific lesson row
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId),
              moduleId !== null ? eq(roleCourses.moduleId, moduleId) : isNull(roleCourses.moduleId),
              eq(roleCourses.lessonId, lessonId)
            )
          );
      }
    } else {
      // GRANT permission
      if (moduleId === null && lessonId === null) {
        // Course-level grant ("Select All"): delete all existing rows, insert one course-level row
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId)
            )
          );
        await db.insert(roleCourses).values({
          roleId,
          courseId,
          moduleId: null,
          lessonId: null,
        });
      } else if (moduleId !== null && lessonId === null) {
        // Module-level grant: delete existing module row + lesson rows for this module, insert module-level row
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId),
              eq(roleCourses.moduleId, moduleId)
            )
          );
        await db.insert(roleCourses).values({
          roleId,
          courseId,
          moduleId,
          lessonId: null,
        });
      } else if (lessonId !== null) {
        // Lesson-level grant: delete existing matching row (dedup), insert
        await db
          .delete(roleCourses)
          .where(
            and(
              eq(roleCourses.roleId, roleId),
              eq(roleCourses.courseId, courseId),
              moduleId !== null ? eq(roleCourses.moduleId, moduleId) : isNull(roleCourses.moduleId),
              eq(roleCourses.lessonId, lessonId)
            )
          );
        await db.insert(roleCourses).values({
          roleId,
          courseId,
          moduleId,
          lessonId,
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating role courses:", error);
    return NextResponse.json(
      { error: "Failed to update role courses" },
      { status: 500 }
    );
  }
}
