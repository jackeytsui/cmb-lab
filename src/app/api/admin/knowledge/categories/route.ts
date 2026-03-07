import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbCategories } from "@/db/schema";
import { asc, max } from "drizzle-orm";

/**
 * GET /api/admin/knowledge/categories
 * List all knowledge base categories ordered by sortOrder.
 * Requires coach role minimum.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const categories = await db
      .select()
      .from(kbCategories)
      .orderBy(asc(kbCategories.sortOrder));

    return NextResponse.json({ categories });
  } catch (error) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/knowledge/categories
 * Create a new knowledge base category.
 * Requires coach role minimum.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, slug: providedSlug, description } = body;

    // Validate required fields
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    // Auto-generate slug from name if not provided
    const slug =
      providedSlug && typeof providedSlug === "string"
        ? providedSlug.trim()
        : name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "");

    // Get max sortOrder to auto-increment
    const [maxResult] = await db
      .select({ maxSort: max(kbCategories.sortOrder) })
      .from(kbCategories);
    const nextSortOrder = (maxResult?.maxSort ?? -1) + 1;

    const [category] = await db
      .insert(kbCategories)
      .values({
        name: name.trim(),
        slug,
        description: description?.trim() || null,
        sortOrder: nextSortOrder,
      })
      .returning();

    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
