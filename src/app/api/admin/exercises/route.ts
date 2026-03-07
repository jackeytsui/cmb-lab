import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { exerciseDefinitionSchema } from "@/types/exercises";
import { createExercise, listExercises } from "@/lib/practice";

/**
 * GET /api/admin/exercises?practiceSetId=X
 * List exercises for a practice set, filtered by deletedAt IS NULL.
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
        { error: "practiceSetId query parameter is required" },
        { status: 400 }
      );
    }

    const exercises = await listExercises(practiceSetId);

    return NextResponse.json({ exercises });
  } catch (error) {
    console.error("Error fetching exercises:", error);
    return NextResponse.json(
      { error: "Failed to fetch exercises" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/exercises
 * Create a new exercise with Zod-validated definition.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { practiceSetId, type, language, definition, sortOrder } = body;

    // Validate practiceSetId
    if (!practiceSetId) {
      return NextResponse.json(
        { error: "practiceSetId is required" },
        { status: 400 }
      );
    }

    // Validate language
    const validLanguages = ["cantonese", "mandarin", "both"];
    if (!validLanguages.includes(language)) {
      return NextResponse.json(
        { error: "Language must be 'cantonese', 'mandarin', or 'both'" },
        { status: 400 }
      );
    }

    // Validate definition with Zod discriminated union
    const result = exerciseDefinitionSchema.safeParse(definition);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message ?? "Invalid definition" },
        { status: 400 }
      );
    }

    // Validate that definition type matches the declared type
    if (result.data.type !== type) {
      return NextResponse.json(
        {
          error: `Type mismatch: declared type '${type}' does not match definition type '${result.data.type}'`,
        },
        { status: 400 }
      );
    }

    const exercise = await createExercise({
      practiceSetId,
      type: result.data.type,
      language,
      definition: result.data,
      sortOrder,
    });

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    console.error("Error creating exercise:", error);
    return NextResponse.json(
      { error: "Failed to create exercise" },
      { status: 500 }
    );
  }
}
