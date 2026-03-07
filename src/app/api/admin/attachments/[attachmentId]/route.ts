import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { eq } from "drizzle-orm";
import { lessonAttachments } from "@/db/schema/courses";

/**
 * DELETE /api/admin/attachments/[attachmentId]
 * Delete an attachment.
 * Requires admin role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { attachmentId } = await params;

    await db
      .delete(lessonAttachments)
      .where(eq(lessonAttachments.id, attachmentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting attachment:", error);
    return NextResponse.json(
      { error: "Failed to delete attachment" },
      { status: 500 }
    );
  }
}
