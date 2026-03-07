import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { ghlFieldMappings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * DELETE /api/admin/ghl/field-mappings/[id]
 * Delete a field mapping by ID.
 * Requires admin role.
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
      .delete(ghlFieldMappings)
      .where(eq(ghlFieldMappings.id, id))
      .returning({ id: ghlFieldMappings.id });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "Field mapping not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting field mapping:", error);
    return NextResponse.json(
      { error: "Failed to delete field mapping" },
      { status: 500 }
    );
  }
}
