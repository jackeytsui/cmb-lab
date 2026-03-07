import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbCategories } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * PATCH /api/admin/knowledge/categories/[categoryId]
 * Update a knowledge base category.
 * Requires coach role minimum.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { categoryId } = await params;
    const body = await request.json();
    const { name, slug, description, sortOrder } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (slug !== undefined) updates.slug = slug.trim();
    if (description !== undefined)
      updates.description = description?.trim() || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;
    updates.updatedAt = new Date();

    const [category] = await db
      .update(kbCategories)
      .set(updates)
      .where(eq(kbCategories.id, categoryId))
      .returning();

    if (!category) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: "Failed to update category" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/knowledge/categories/[categoryId]
 * Delete a knowledge base category.
 * Requires admin role (only admins can delete categories).
 * Entries in this category will have categoryId set to null (onDelete: set null).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { categoryId } = await params;

    const [deleted] = await db
      .delete(kbCategories)
      .where(eq(kbCategories.id, categoryId))
      .returning({ id: kbCategories.id });

    if (!deleted) {
      return NextResponse.json(
        { error: "Category not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Failed to delete category" },
      { status: 500 }
    );
  }
}
