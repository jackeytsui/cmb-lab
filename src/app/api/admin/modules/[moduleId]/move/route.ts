import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, modules } from "@/db/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ moduleId: string }>;
}

/**
 * PATCH /api/admin/modules/[moduleId]/move
 * Move a module to a different course.
 *
 * Body: { targetCourseId: string, position?: number }
 * position: 0 = first, undefined = last
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { moduleId } = await params;
    const body = await request.json();
    const { targetCourseId, position } = body;

    if (!targetCourseId) {
      return NextResponse.json(
        { error: "targetCourseId is required" },
        { status: 400 }
      );
    }

    // Verify module exists
    const [module] = await db
      .select()
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // If same course, nothing to do
    if (module.courseId === targetCourseId) {
      return NextResponse.json(
        { error: "Module is already in this course" },
        { status: 400 }
      );
    }

    // Verify target course exists
    const [targetCourse] = await db
      .select()
      .from(courses)
      .where(and(eq(courses.id, targetCourseId), isNull(courses.deletedAt)));

    if (!targetCourse) {
      return NextResponse.json(
        { error: "Target course not found" },
        { status: 404 }
      );
    }

    // Get max sortOrder in target course
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(${modules.sortOrder}), -1)` })
      .from(modules)
      .where(
        and(eq(modules.courseId, targetCourseId), isNull(modules.deletedAt))
      );

    const newSortOrder =
      position !== undefined ? position : (maxResult?.max ?? -1) + 1;

    // Move module in a transaction
    const [updated] = await db.transaction(async (tx) => {
      // If inserting at specific position, shift existing modules
      if (position !== undefined) {
        await tx
          .update(modules)
          .set({ sortOrder: sql`${modules.sortOrder} + 1` })
          .where(
            and(
              eq(modules.courseId, targetCourseId),
              isNull(modules.deletedAt),
              sql`${modules.sortOrder} >= ${position}`
            )
          );
      }

      // Update module's course and sortOrder
      return tx
        .update(modules)
        .set({
          courseId: targetCourseId,
          sortOrder: newSortOrder,
        })
        .where(eq(modules.id, moduleId))
        .returning();
    });

    return NextResponse.json({
      success: true,
      module: updated,
      movedTo: {
        courseId: targetCourseId,
        courseTitle: targetCourse.title,
        sortOrder: newSortOrder,
      },
    });
  } catch (error) {
    console.error("Error moving module:", error);
    return NextResponse.json(
      { error: "Failed to move module" },
      { status: 500 }
    );
  }
}
