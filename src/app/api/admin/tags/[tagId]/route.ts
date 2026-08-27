import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { updateTag, deleteTag } from "@/lib/tags";
import { z } from "zod";

const updateTagSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color").optional(),
  description: z.string().max(500, "Description must be 500 characters or less").optional(),
});

/**
 * PATCH /api/admin/tags/[tagId]
 * Update a tag's name, color, or description.
 * Requires administrator role.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { tagId } = await params;
    const body = await request.json();
    const parsed = updateTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const tag = await updateTag(tagId, parsed.data);
    if (!tag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    console.error("Error updating tag:", error);
    return NextResponse.json(
      { error: "Failed to update tag" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/tags/[tagId]
 * Delete a tag (cascades to student_tags and auto_tag_rules).
 * Requires administrator role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { tagId } = await params;
    const deleted = await deleteTag(tagId);
    if (!deleted) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting tag:", error);
    return NextResponse.json(
      { error: "Failed to delete tag" },
      { status: 500 }
    );
  }
}
