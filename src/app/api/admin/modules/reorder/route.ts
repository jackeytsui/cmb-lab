import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { modules } from "@/db/schema";
import { eq, isNull, and, inArray } from "drizzle-orm";

/**
 * PATCH /api/admin/modules/reorder
 * Update sortOrder for multiple modules.
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

    const moduleIds = items.map((item) => item.id);

    // Verify all modules exist and belong to the same course
    const existingModules = await db
      .select({ id: modules.id, courseId: modules.courseId })
      .from(modules)
      .where(and(inArray(modules.id, moduleIds), isNull(modules.deletedAt)));

    if (existingModules.length !== moduleIds.length) {
      return NextResponse.json(
        { error: "One or more modules not found" },
        { status: 404 }
      );
    }

    // Verify all modules belong to the same course
    const courseIds = new Set(existingModules.map((m) => m.courseId));
    if (courseIds.size > 1) {
      return NextResponse.json(
        { error: "All modules must belong to the same course" },
        { status: 400 }
      );
    }

    // Update sortOrder for each module in a transaction
    const updatedModules = await db.transaction(async (tx) => {
      const results = [];
      for (const item of items) {
        const [updated] = await tx
          .update(modules)
          .set({ sortOrder: item.sortOrder })
          .where(eq(modules.id, item.id))
          .returning();
        results.push(updated);
      }
      return results;
    });

    return NextResponse.json({ modules: updatedModules });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return NextResponse.json(
      { error: "Failed to reorder modules" },
      { status: 500 }
    );
  }
}
