import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import {
  createThreadAssignment,
  listCoachThreadAssignments,
} from "@/lib/thread-assignments";

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];

/**
 * POST /api/admin/thread-assignments
 * Create a new thread assignment linking a video thread to a target.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { threadId, targetType, targetId, notes, dueDate } = body;

    // Validate required fields
    if (!threadId || typeof threadId !== "string") {
      return NextResponse.json(
        { error: "threadId is required" },
        { status: 400 }
      );
    }

    if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
      return NextResponse.json(
        {
          error: `targetType is required and must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (!targetId || typeof targetId !== "string") {
      return NextResponse.json(
        { error: "targetId is required" },
        { status: 400 }
      );
    }

    // Parse optional dueDate
    const parsedDueDate = dueDate ? new Date(dueDate) : undefined;
    if (dueDate && isNaN(parsedDueDate!.getTime())) {
      return NextResponse.json(
        { error: "dueDate must be a valid date string" },
        { status: 400 }
      );
    }

    const assignment = await createThreadAssignment({
      threadId,
      targetType,
      targetId,
      assignedBy: user.id,
      notes: notes || undefined,
      dueDate: parsedDueDate,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Handle known error cases with specific status codes
    if (message.includes("already assigned")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Error creating thread assignment:", error);
    return NextResponse.json(
      { error: "Failed to create thread assignment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/thread-assignments
 * List all thread assignments created by the current coach.
 * Requires coach role.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 401 }
      );
    }

    const assignments = await listCoachThreadAssignments(user.id);

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Error fetching thread assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch thread assignments" },
      { status: 500 }
    );
  }
}
