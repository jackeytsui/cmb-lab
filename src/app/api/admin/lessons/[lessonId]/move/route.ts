import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessons, modules } from "@/db/schema";
import { eq, isNull, and, sql } from "drizzle-orm";

interface RouteParams {
  params: Promise<{ lessonId: string }>;
}

/**
 * PATCH /api/admin/lessons/[lessonId]/move
 * Move a lesson to a different module.
 *
 * Body: { targetModuleId: string, position?: number }
 * position: 0 = first, undefined = last
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { lessonId } = await params;
    const body = await request.json();
    const { targetModuleId, position } = body;

    if (!targetModuleId) {
      return NextResponse.json(
        { error: "targetModuleId is required" },
        { status: 400 }
      );
    }

    // Verify lesson exists
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

    if (!lesson) {
      return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
    }

    // If same module, nothing to do
    if (lesson.moduleId === targetModuleId) {
      return NextResponse.json(
        { error: "Lesson is already in this module" },
        { status: 400 }
      );
    }

    // Verify target module exists
    const [targetModule] = await db
      .select()
      .from(modules)
      .where(and(eq(modules.id, targetModuleId), isNull(modules.deletedAt)));

    if (!targetModule) {
      return NextResponse.json(
        { error: "Target module not found" },
        { status: 404 }
      );
    }

    // Get max sortOrder in target module
    const [maxResult] = await db
      .select({ max: sql<number>`COALESCE(MAX(${lessons.sortOrder}), -1)` })
      .from(lessons)
      .where(
        and(eq(lessons.moduleId, targetModuleId), isNull(lessons.deletedAt))
      );

    const newSortOrder =
      position !== undefined ? position : (maxResult?.max ?? -1) + 1;

    // Move lesson in a transaction
    const [updated] = await db.transaction(async (tx) => {
      // If inserting at specific position, shift existing lessons
      if (position !== undefined) {
        await tx
          .update(lessons)
          .set({ sortOrder: sql`${lessons.sortOrder} + 1` })
          .where(
            and(
              eq(lessons.moduleId, targetModuleId),
              isNull(lessons.deletedAt),
              sql`${lessons.sortOrder} >= ${position}`
            )
          );
      }

      // Update lesson's module and sortOrder
      return tx
        .update(lessons)
        .set({
          moduleId: targetModuleId,
          sortOrder: newSortOrder,
        })
        .where(eq(lessons.id, lessonId))
        .returning();
    });

    return NextResponse.json({
      success: true,
      lesson: updated,
      movedTo: {
        moduleId: targetModuleId,
        moduleTitle: targetModule.title,
        sortOrder: newSortOrder,
      },
    });
  } catch (error) {
    console.error("Error moving lesson:", error);
    return NextResponse.json(
      { error: "Failed to move lesson" },
      { status: 500 }
    );
  }
}
