import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { createAssignment, listAssignmentsForSet } from "@/lib/assignments";

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];

/**
 * POST /api/admin/assignments
 * Create a new assignment linking a published practice set to a target.
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
    const { practiceSetId, targetType, targetId, dueDate } = body;

    // Validate required fields
    if (!practiceSetId || typeof practiceSetId !== "string") {
      return NextResponse.json(
        { error: "practiceSetId is required" },
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

    const assignment = await createAssignment({
      practiceSetId,
      targetType,
      targetId,
      assignedBy: user.id,
      dueDate: parsedDueDate,
    });

    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";

    // Handle known error cases with specific status codes
    if (message.includes("already exists")) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes("not found") || message.includes("not published")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Error creating assignment:", error);
    return NextResponse.json(
      { error: "Failed to create assignment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/assignments?practiceSetId=...
 * List all assignments for a given practice set.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const practiceSetId = searchParams.get("practiceSetId");

    if (!practiceSetId) {
      return NextResponse.json(
        { error: "practiceSetId query parameter required" },
        { status: 400 }
      );
    }

    const assignments = await listAssignmentsForSet(practiceSetId);

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch assignments" },
      { status: 500 }
    );
  }
}
