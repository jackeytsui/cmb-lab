import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { exerciseDefinitionSchema } from "@/types/exercises";
import { getExercise, updateExercise, deleteExercise } from "@/lib/practice";

interface RouteParams {
  params: Promise<{ exerciseId: string }>;
}

/**
 * GET /api/admin/exercises/[exerciseId]
 * Get a single exercise by ID.
 * Requires coach role.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { exerciseId } = await params;

    const exercise = await getExercise(exerciseId);

    if (!exercise) {
      return NextResponse.json(
        { error: "Exercise not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exercise });
  } catch (error) {
    console.error("Error fetching exercise:", error);
    return NextResponse.json(
      { error: "Failed to fetch exercise" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/exercises/[exerciseId]
 * Update exercise definition and/or language.
 * Requires coach role.
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { exerciseId } = await params;
    const body = await request.json();
    const { language, definition, sortOrder } = body;

    // Validate definition if provided
    if (definition !== undefined) {
      const result = exerciseDefinitionSchema.safeParse(definition);
      if (!result.success) {
        return NextResponse.json(
          { error: result.error.issues[0]?.message ?? "Invalid definition" },
          { status: 400 }
        );
      }
    }

    // Validate language if provided
    if (language !== undefined) {
      const validLanguages = ["cantonese", "mandarin", "both"];
      if (!validLanguages.includes(language)) {
        return NextResponse.json(
          { error: "Language must be 'cantonese', 'mandarin', or 'both'" },
          { status: 400 }
        );
      }
    }

    const exercise = await updateExercise(exerciseId, {
      language,
      definition,
      sortOrder,
    });

    if (!exercise) {
      return NextResponse.json(
        { error: "Exercise not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ exercise });
  } catch (error) {
    console.error("Error updating exercise:", error);
    return NextResponse.json(
      { error: "Failed to update exercise" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/exercises/[exerciseId]
 * Soft-delete an exercise by setting deletedAt.
 * Requires coach role.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { exerciseId } = await params;

    const deleted = await deleteExercise(exerciseId);

    if (!deleted) {
      return NextResponse.json(
        { error: "Exercise not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting exercise:", error);
    return NextResponse.json(
      { error: "Failed to delete exercise" },
      { status: 500 }
    );
  }
}
