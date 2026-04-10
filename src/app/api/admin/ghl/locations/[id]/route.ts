import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlLocations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const updateLocationSchema = z.object({
  name: z.string().min(1).optional(),
  apiToken: z.string().min(1).optional(),
  webhookSecret: z.string().optional(),
  isActive: z.boolean().optional(),
});

/**
 * PUT /api/admin/ghl/locations/[id]
 * Update a GHL location.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const parsed = updateLocationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.apiToken !== undefined) updates.apiToken = parsed.data.apiToken;
    if (parsed.data.webhookSecret !== undefined) updates.webhookSecret = parsed.data.webhookSecret || null;
    if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(ghlLocations)
      .set(updates)
      .where(eq(ghlLocations.id, id))
      .returning({
        id: ghlLocations.id,
        name: ghlLocations.name,
        ghlLocationId: ghlLocations.ghlLocationId,
        isActive: ghlLocations.isActive,
        updatedAt: ghlLocations.updatedAt,
      });

    if (!updated) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ location: updated });
  } catch (error) {
    console.error("Error updating GHL location:", error);
    return NextResponse.json(
      { error: "Failed to update location" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/ghl/locations/[id]
 * Delete a GHL location.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { id } = await params;

    const deleted = await db
      .delete(ghlLocations)
      .where(eq(ghlLocations.id, id))
      .returning({ id: ghlLocations.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Location not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting GHL location:", error);
    return NextResponse.json(
      { error: "Failed to delete location" },
      { status: 500 }
    );
  }
}
