import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { practiceExercises } from "@/db/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";

/**
 * PATCH /api/admin/exercises/reorder
 * Update sortOrder for multiple exercises within the same practice set.
 * Requires coach role.
 */
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
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

    const exerciseIds = items.map((item) => item.id);

    // Verify all exercises exist and are not soft-deleted
    const existingExercises = await db
      .select({
        id: practiceExercises.id,
        practiceSetId: practiceExercises.practiceSetId,
      })
      .from(practiceExercises)
      .where(
        and(
          inArray(practiceExercises.id, exerciseIds),
          isNull(practiceExercises.deletedAt)
        )
      );

    if (existingExercises.length !== exerciseIds.length) {
      return NextResponse.json(
        { error: "One or more exercises not found" },
        { status: 404 }
      );
    }

    // Verify all exercises belong to the same practice set
    const practiceSetIds = new Set(
      existingExercises.map((e) => e.practiceSetId)
    );
    if (practiceSetIds.size > 1) {
      return NextResponse.json(
        { error: "All exercises must belong to the same practice set" },
        { status: 400 }
      );
    }

    // Update sortOrder for each exercise in a transaction
    const updatedExercises = await db.transaction(async (tx) => {
      const results = [];
      for (const item of items) {
        const [updated] = await tx
          .update(practiceExercises)
          .set({ sortOrder: item.sortOrder })
          .where(eq(practiceExercises.id, item.id))
          .returning();
        results.push(updated);
      }
      return results;
    });

    return NextResponse.json({ exercises: updatedExercises });
  } catch (error) {
    console.error("Error reordering exercises:", error);
    return NextResponse.json(
      { error: "Failed to reorder exercises" },
      { status: 500 }
    );
  }
}
