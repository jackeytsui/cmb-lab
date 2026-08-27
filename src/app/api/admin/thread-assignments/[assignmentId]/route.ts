import { NextRequest, NextResponse } from "next/server";
import {
  deleteThreadAssignment,
  getThreadAssignmentProgress,
} from "@/lib/thread-assignments";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import { z } from "zod";

interface RouteParams {
  params: Promise<{ assignmentId: string }>;
}

/**
 * DELETE /api/admin/thread-assignments/[assignmentId]
 * Remove a thread assignment.
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
        { error: "Thread assignment not found" },
        { status: 404 },
      );
    }

    const deleted = await deleteThreadAssignment(
      assignmentId,
      access.actor.role === "admin" ? null : access.actor.id,
    );

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
        { error: "Thread assignment not found" },
        { status: 404 },
      );
    }

    const progress = await getThreadAssignmentProgress(
      assignmentId,
      access.actor.role === "admin" ? null : access.actor.id,
    );

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
