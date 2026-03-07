import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/db";
import { filterPresets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

interface RouteParams {
  params: Promise<{ presetId: string }>;
}

const updatePresetSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  filters: z
    .object({
      search: z.string().optional(),
      tagIds: z.array(z.string()).optional(),
      courseId: z.string().optional(),
      progressStatus: z.string().optional(),
      atRisk: z.boolean().optional(),
      sortBy: z.string().optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    })
    .optional(),
  isDefault: z.boolean().optional(),
});

/**
 * PATCH /api/admin/students/filter-presets/[presetId]
 * Update a filter preset. Only the owner can update.
 * Requires coach+ role.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { presetId } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Verify preset belongs to current user
  const [existing] = await db
    .select()
    .from(filterPresets)
    .where(
      and(
        eq(filterPresets.id, presetId),
        eq(filterPresets.createdBy, currentUser.id),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updatePresetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { name, filters, isDefault } = parsed.data;

  try {
    // If setting as default, unset any existing default for this user
    if (isDefault) {
      await db
        .update(filterPresets)
        .set({ isDefault: false })
        .where(
          and(
            eq(filterPresets.createdBy, currentUser.id),
            eq(filterPresets.isDefault, true),
          ),
        );
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (filters !== undefined) updateData.filters = filters;
    if (isDefault !== undefined) updateData.isDefault = isDefault;

    const [updated] = await db
      .update(filterPresets)
      .set(updateData)
      .where(eq(filterPresets.id, presetId))
      .returning();

    return NextResponse.json({ preset: updated });
  } catch (error) {
    console.error("Error updating filter preset:", error);
    return NextResponse.json(
      { error: "Failed to update filter preset" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/students/filter-presets/[presetId]
 * Delete a filter preset. Only the owner can delete.
 * Requires coach+ role.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { presetId } = await params;

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  // Verify preset belongs to current user
  const [existing] = await db
    .select({ id: filterPresets.id })
    .from(filterPresets)
    .where(
      and(
        eq(filterPresets.id, presetId),
        eq(filterPresets.createdBy, currentUser.id),
      ),
    )
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Preset not found" }, { status: 404 });
  }

  try {
    await db.delete(filterPresets).where(eq(filterPresets.id, presetId));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting filter preset:", error);
    return NextResponse.json(
      { error: "Failed to delete filter preset" },
      { status: 500 },
    );
  }
}
