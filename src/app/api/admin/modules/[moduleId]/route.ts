import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { modules, lessons, practiceSetAssignments, practiceSets } from "@/db/schema";
import { eq, isNull, asc, and, inArray } from "drizzle-orm";

/**
 * GET /api/admin/modules/[moduleId]
 * Get a single module with its lessons and assigned exercises.
 * Requires admin role.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { moduleId } = await params;

    // Get module
    const [module] = await db
      .select()
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));

    if (!module) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Get lessons for this module
    const lessonList = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.moduleId, moduleId), isNull(lessons.deletedAt)))
      .orderBy(asc(lessons.sortOrder));

    // Get assigned practice sets for these lessons
    const lessonIds = lessonList.map((l) => l.id);
    const exercisesMap = new Map<string, { id: string; title: string; lessonId: string; assignmentId: string }[]>();

    if (lessonIds.length > 0) {
      const assignedSets = await db
        .select({
          id: practiceSets.id,
          title: practiceSets.title,
          lessonId: practiceSetAssignments.targetId,
          assignmentId: practiceSetAssignments.id,
        })
        .from(practiceSetAssignments)
        .innerJoin(
          practiceSets,
          eq(practiceSets.id, practiceSetAssignments.practiceSetId)
        )
        .where(
          and(
            inArray(practiceSetAssignments.targetId, lessonIds),
            eq(practiceSetAssignments.targetType, "lesson"),
            isNull(practiceSets.deletedAt)
          )
        ) as { id: string; title: string; lessonId: string; assignmentId: string }[];

      for (const set of assignedSets) {
        const list = exercisesMap.get(set.lessonId) || [];
        list.push(set);
        exercisesMap.set(set.lessonId, list);
      }
    }

    // Attach exercises to lessons
    const lessonsWithExercises = lessonList.map((lesson) => ({
      ...lesson,
      exercises: exercisesMap.get(lesson.id) || [],
    }));

    return NextResponse.json({
      module: {
        ...module,
        lessons: lessonsWithExercises,
      },
    });
  } catch (error) {
    console.error("Error fetching module:", error);
    return NextResponse.json(
      { error: "Failed to fetch module" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/modules/[moduleId]
 * Update module fields (partial update supported).
 * Requires admin role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { moduleId } = await params;
    const body = await request.json();

    // Check module exists
    const [existing] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Build update object with only provided fields
    const updateData: Partial<{
      title: string;
      description: string | null;
      sortOrder: number;
    }> = {};

    if (body.title !== undefined) {
      if (typeof body.title !== "string" || body.title.trim().length < 1) {
        return NextResponse.json(
          { error: "Title is required" },
          { status: 400 }
        );
      }
      updateData.title = body.title.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description?.trim() || null;
    }
    if (body.sortOrder !== undefined) {
      updateData.sortOrder = Number(body.sortOrder);
    }

    const [updatedModule] = await db
      .update(modules)
      .set(updateData)
      .where(eq(modules.id, moduleId))
      .returning();

    return NextResponse.json({ module: updatedModule });
  } catch (error) {
    console.error("Error updating module:", error);
    return NextResponse.json(
      { error: "Failed to update module" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/modules/[moduleId]
 * Soft delete a module by setting deletedAt.
 * Requires admin role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { moduleId } = await params;

    // Check module exists
    const [existing] = await db
      .select({ id: modules.id })
      .from(modules)
      .where(and(eq(modules.id, moduleId), isNull(modules.deletedAt)));

    if (!existing) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    // Soft delete
    await db
      .update(modules)
      .set({ deletedAt: new Date() })
      .where(eq(modules.id, moduleId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting module:", error);
    return NextResponse.json(
      { error: "Failed to delete module" },
      { status: 500 }
    );
  }
}
