import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  updateAssignmentDueDate,
  deleteAssignment,
} from "@/lib/assignments";

interface RouteParams {
  params: Promise<{ assignmentId: string }>;
}

/**
 * PUT /api/admin/assignments/[assignmentId]
 * Update the due date on an existing assignment.
 * Requires coach role.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { assignmentId } = await params;
    const body = await request.json();
    const { dueDate } = body;

    // Parse dueDate: null clears it, string sets it
    const parsedDueDate =
      dueDate === null ? null : dueDate ? new Date(dueDate) : undefined;

    if (parsedDueDate === undefined) {
      return NextResponse.json(
        { error: "dueDate is required (string or null)" },
        { status: 400 }
      );
    }

    if (parsedDueDate !== null && isNaN(parsedDueDate.getTime())) {
      return NextResponse.json(
        { error: "dueDate must be a valid date string or null" },
        { status: 400 }
      );
    }

    const assignment = await updateAssignmentDueDate(
      assignmentId,
      parsedDueDate
    );

    if (!assignment) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    console.error("Error updating assignment:", error);
    return NextResponse.json(
      { error: "Failed to update assignment" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/assignments/[assignmentId]
 * Remove an assignment.
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

    const deleted = await deleteAssignment(assignmentId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Assignment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Failed to delete assignment" },
      { status: 500 }
    );
  }
}
