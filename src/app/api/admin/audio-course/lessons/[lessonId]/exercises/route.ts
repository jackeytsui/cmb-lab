import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { getCurrentUser } from "@/lib/auth";
import {
  getOrCreateLessonPracticeSet,
  getLessonPracticeSet,
  listExercises,
  createExercise,
  updateExercise,
  deleteExercise,
} from "@/lib/practice";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { exerciseDefinitionSchema } from "@/types/exercises";

/**
 * GET /api/admin/audio-course/lessons/[lessonId]/exercises
 * List all exercises for an audio lesson's practice set.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;

  const practiceSet = await getLessonPracticeSet(lessonId);
  if (!practiceSet) {
    return NextResponse.json({ practiceSetId: null, exercises: [] });
  }

  const exercises = await listExercises(practiceSet.id);
  return NextResponse.json({
    practiceSetId: practiceSet.id,
    practiceSetStatus: practiceSet.status,
    exercises,
  });
}

/**
 * POST /api/admin/audio-course/lessons/[lessonId]/exercises
 * Create a new exercise for an audio lesson. Auto-creates practice set if needed.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { lessonId } = await params;

  // Verify lesson exists
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { id: true, title: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const body = (await request.json()) as {
    type?: string;
    language?: string;
    definition?: unknown;
    sortOrder?: number;
  };

  if (!body.type || !body.definition) {
    return NextResponse.json(
      { error: "type and definition are required" },
      { status: 400 },
    );
  }

  // Validate definition
  const parsed = exerciseDefinitionSchema.safeParse(body.definition);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid exercise definition", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Get or create the practice set for this lesson
  const practiceSet = await getOrCreateLessonPracticeSet(
    lessonId,
    lesson.title,
    user.id,
  );

  const exercise = await createExercise({
    practiceSetId: practiceSet.id,
    type: body.type,
    language: body.language ?? "both",
    definition: parsed.data,
    sortOrder: body.sortOrder,
  });

  return NextResponse.json(
    { practiceSetId: practiceSet.id, exercise },
    { status: 201 },
  );
}

/**
 * PUT /api/admin/audio-course/lessons/[lessonId]/exercises
 * Update an existing exercise. Body must include { exerciseId, ... }.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await params; // consume params

  const body = (await request.json()) as {
    exerciseId: string;
    language?: string;
    definition?: unknown;
    sortOrder?: number;
  };

  if (!body.exerciseId) {
    return NextResponse.json(
      { error: "exerciseId is required" },
      { status: 400 },
    );
  }

  const updates: Parameters<typeof updateExercise>[1] = {};
  if (body.language !== undefined) updates.language = body.language;
  if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;

  if (body.definition !== undefined) {
    const parsed = exerciseDefinitionSchema.safeParse(body.definition);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid exercise definition", details: parsed.error.issues },
        { status: 400 },
      );
    }
    updates.definition = parsed.data;
  }

  const updated = await updateExercise(body.exerciseId, updates);
  if (!updated) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json({ exercise: updated });
}

/**
 * DELETE /api/admin/audio-course/lessons/[lessonId]/exercises
 * Delete an exercise. Body must include { exerciseId }.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await params;

  const body = (await request.json()) as { exerciseId: string };
  if (!body.exerciseId) {
    return NextResponse.json(
      { error: "exerciseId is required" },
      { status: 400 },
    );
  }

  const deleted = await deleteExercise(body.exerciseId);
  if (!deleted) {
    return NextResponse.json({ error: "Exercise not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
