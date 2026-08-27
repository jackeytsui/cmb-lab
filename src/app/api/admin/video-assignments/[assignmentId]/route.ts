import { NextRequest, NextResponse } from "next/server";
import { deleteVideoAssignment } from "@/lib/video-assignments";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ assignmentId: string }>;
}

/**
 * DELETE /api/admin/video-assignments/[assignmentId]
 * Remove a video assignment.
 * Requires coach role.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { assignmentId } = await params;
    if (!z.string().uuid().safeParse(assignmentId).success) {
      return NextResponse.json(
        { error: "Video assignment not found" },
        { status: 404 },
      );
    }

    const deleted = await deleteVideoAssignment(
      assignmentId,
      access.actor.role === "admin" ? null : access.actor.id,
    );

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
