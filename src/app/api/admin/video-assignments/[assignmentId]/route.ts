import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { deleteVideoAssignment } from "@/lib/video-assignments";

interface RouteParams {
  params: Promise<{ assignmentId: string }>;
}

/**
 * DELETE /api/admin/video-assignments/[assignmentId]
 * Remove a video assignment.
 * Requires coach role.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { assignmentId } = await params;

    const deleted = await deleteVideoAssignment(assignmentId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Video assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting video assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete video assignment" },
      { status: 500 }
    );
  }
}
