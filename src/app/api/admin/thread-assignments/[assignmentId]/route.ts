import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  deleteThreadAssignment,
  getThreadAssignmentProgress,
} from "@/lib/thread-assignments";

interface RouteParams {
  params: Promise<{ assignmentId: string }>;
}

/**
 * DELETE /api/admin/thread-assignments/[assignmentId]
 * Remove a thread assignment.
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

    const deleted = await deleteThreadAssignment(assignmentId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Thread assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting thread assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete thread assignment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/thread-assignments/[assignmentId]
 * Get per-student progress for a specific thread assignment.
 * Requires coach role.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { assignmentId } = await params;

    const progress = await getThreadAssignmentProgress(assignmentId);

    if (!progress) {
      return NextResponse.json(
        { error: "Thread assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(progress);
  } catch (error) {
    console.error("Error fetching thread assignment progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread assignment progress" },
      { status: 500 }
    );
  }
}
