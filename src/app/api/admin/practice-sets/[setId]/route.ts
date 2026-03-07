import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import {
  getPracticeSet,
  updatePracticeSet,
  deletePracticeSet,
  listExercises,
} from "@/lib/practice";

interface RouteParams {
  params: Promise<{ setId: string }>;
}

/**
 * GET /api/admin/practice-sets/[setId]
 * Get a single practice set with its exercises.
 * Requires coach role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { setId } = await params;

    const practiceSet = await getPracticeSet(setId);

    if (!practiceSet) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    const exercises = await listExercises(setId);

    return NextResponse.json({ practiceSet, exercises });
  } catch (error) {
    console.error("Error fetching practice set:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice set" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/practice-sets/[setId]
 * Update a practice set (title, description, status).
 * Requires coach role.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { setId } = await params;
    const body = await request.json();
    const { title, description, status } = body;

    // Validate status if provided
    if (status !== undefined) {
      const validStatuses = ["draft", "published", "archived"];
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: "Status must be 'draft', 'published', or 'archived'" },
          { status: 400 }
        );
      }
    }

    const practiceSet = await updatePracticeSet(setId, {
      title,
      description,
      status,
    });

    if (!practiceSet) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ practiceSet });
  } catch (error) {
    console.error("Error updating practice set:", error);
    return NextResponse.json(
      { error: "Failed to update practice set" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/practice-sets/[setId]
 * Soft-delete a practice set by setting deletedAt.
 * Requires coach role.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { setId } = await params;

    const deleted = await deletePracticeSet(setId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Practice set not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting practice set:", error);
    return NextResponse.json(
      { error: "Failed to delete practice set" },
      { status: 500 }
    );
  }
}
