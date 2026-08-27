import { NextRequest, NextResponse } from "next/server";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import {
  createVideoAssignment,
  listCoachVideoAssignments,
} from "@/lib/video-assignments";

const VALID_TARGET_TYPES = ["course", "module", "lesson", "student", "tag"];

/**
 * POST /api/admin/video-assignments
 * Create a new video assignment linking a YouTube video to a target.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (access.actor.id !== access.realActor.id) {
    return NextResponse.json(
      { error: "Exit View As before creating an assignment" },
      { status: 409 },
    );
  }

  try {
    const body = await request.json();
    const { youtubeUrl, title, notes, targetType, targetId, dueDate } = body;

    // Validate required fields
    if (!youtubeUrl || typeof youtubeUrl !== "string") {
      return NextResponse.json(
        { error: "youtubeUrl is required" },
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

    const assignment = await createVideoAssignment({
      youtubeUrl,
      title: title || undefined,
      notes: notes || undefined,
      targetType,
      targetId,
      assignedBy: access.realActor.id,
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
    if (message.includes("not found") || message.includes("Invalid YouTube URL")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("Error creating video assignment:", error);
    return NextResponse.json(
      { error: "Failed to create video assignment" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/video-assignments
 * List all video assignments created by the current coach.
 * Requires coach role.
 */
export async function GET() {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const assignments = await listCoachVideoAssignments(
      access.actor.role === "admin" ? null : access.actor.id,
    );

    return NextResponse.json({ assignments });
  } catch (error) {
    console.error("Error fetching video assignments:", error);
    return NextResponse.json(
      { error: "Failed to fetch video assignments" },
      { status: 500 }
    );
  }
}
