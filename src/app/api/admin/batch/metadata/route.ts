import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { courses, modules, lessons } from "@/db/schema";
import { eq, inArray, isNull, and } from "drizzle-orm";

interface MetadataUpdate {
  id: string;
  title?: string;
  description?: string;
}

/**
 * PATCH /api/admin/batch/metadata
 * Batch update metadata for multiple items.
 *
 * Body: {
 *   type: "course" | "module" | "lesson",
 *   updates: [{ id, title?, description? }]
 * }
 */
export async function PATCH(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { type, updates } = body as {
      type: "course" | "module" | "lesson";
      updates: MetadataUpdate[];
    };

    if (!type || !["course", "module", "lesson"].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'course', 'module', or 'lesson'" },
        { status: 400 }
      );
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "updates array is required" },
        { status: 400 }
      );
    }

    // Validate all updates have id
    for (const update of updates) {
      if (!update.id) {
        return NextResponse.json(
          { error: "Each update must have an id" },
          { status: 400 }
        );
      }
    }

    // Select table based on type
    const table = type === "course" ? courses : type === "module" ? modules : lessons;

    // Verify all items exist
    const itemIds = updates.map((u) => u.id);
    const existingItems = await db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, itemIds), isNull(table.deletedAt)));

    if (existingItems.length !== itemIds.length) {
      return NextResponse.json(
        { error: `One or more ${type}s not found` },
        { status: 404 }
      );
    }

    // Execute updates in a transaction
    const results = await db.transaction(async (tx) => {
      const updateResults = [];

      for (const update of updates) {
        const setData: Record<string, string> = {};
        if (update.title !== undefined) setData.title = update.title;
        if (update.description !== undefined)
          setData.description = update.description;

        if (Object.keys(setData).length === 0) continue;

        const [updated] = await tx
          .update(table)
          .set(setData)
          .where(eq(table.id, update.id))
          .returning();

        updateResults.push(updated);
      }

      return updateResults;
    });

    return NextResponse.json({
      success: true,
      updated: results.length,
      items: results,
    });
  } catch (error) {
    console.error("Error batch updating metadata:", error);
    return NextResponse.json(
      { error: "Failed to update metadata" },
      { status: 500 }
    );
  }
}
