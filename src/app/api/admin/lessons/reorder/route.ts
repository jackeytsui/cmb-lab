import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";

/**
 * PATCH /api/admin/lessons/reorder
 * Update sortOrder for multiple lessons.
 * Requires admin role.
 */
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const items: { id: string; sortOrder: number }[] = body.items || body;

    // Validate input
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items array is required with {id, sortOrder} objects" },
        { status: 400 }
      );
    }

    for (const item of items) {
      if (!item.id || typeof item.sortOrder !== "number") {
        return NextResponse.json(
          { error: "Each item must have id and sortOrder" },
          { status: 400 }
        );
      }
    }

    const lessonIds = items.map((item) => item.id);

    // Verify all lessons exist and belong to the same module
    const existingLessons = await db
      .select({ id: lessons.id, moduleId: lessons.moduleId })
      .from(lessons)
      .where(and(inArray(lessons.id, lessonIds), isNull(lessons.deletedAt)));

    if (existingLessons.length !== lessonIds.length) {
      return NextResponse.json(
        { error: "One or more lessons not found" },
        { status: 404 }
      );
    }

    // Verify all lessons belong to the same module
    const moduleIds = new Set(existingLessons.map((l) => l.moduleId));
    if (moduleIds.size > 1) {
      return NextResponse.json(
        { error: "All lessons must belong to the same module" },
        { status: 400 }
      );
    }

    // Update sortOrder for each lesson using batch (neon-http doesn't support transactions)
    const batchOps = items.map((item) =>
      db
        .update(lessons)
        .set({ sortOrder: item.sortOrder })
        .where(eq(lessons.id, item.id))
        .returning()
    );

    const results = await db.batch(batchOps as [typeof batchOps[0], ...typeof batchOps[0][]]);
    const updatedLessons = results.flat();

    return NextResponse.json({ lessons: updatedLessons });
  } catch (error) {
    console.error("Error reordering lessons:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: `Failed to reorder lessons: ${errorMessage}` },
      { status: 500 }
    );
  }
}
