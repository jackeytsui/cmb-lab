import { db } from "@/db";
import { practiceSets, practiceExercises, practiceSetAssignments } from "@/db/schema";
import { eq, isNull, asc, and, desc } from "drizzle-orm";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Practice Set CRUD Helpers
// ============================================================

export async function createPracticeSet(data: {
  title: string;
  description?: string;
  createdBy: string;
}) {
  const [set] = await db
    .insert(practiceSets)
    .values({
      title: data.title,
      description: data.description,
      status: "draft",
      createdBy: data.createdBy,
    })
    .returning();

  return set;
}

export async function updatePracticeSet(
  id: string,
  data: {
    title?: string;
    description?: string;
    status?: "draft" | "published" | "archived";
  }
) {
  const [updated] = await db
    .update(practiceSets)
    .set(data)
    .where(and(eq(practiceSets.id, id), isNull(practiceSets.deletedAt)))
    .returning();

  return updated ?? null;
}

export async function deletePracticeSet(id: string) {
  const [deleted] = await db
    .update(practiceSets)
    .set({ deletedAt: new Date() })
    .where(and(eq(practiceSets.id, id), isNull(practiceSets.deletedAt)))
    .returning();

  return deleted ?? null;
}

export async function listPracticeSets(options?: { status?: string }) {
  const conditions = [isNull(practiceSets.deletedAt)];

  if (options?.status) {
    conditions.push(
      eq(
        practiceSets.status,
        options.status as "draft" | "published" | "archived"
      )
    );
  }

  return db
    .select()
    .from(practiceSets)
    .where(and(...conditions))
    .orderBy(desc(practiceSets.createdAt));
}

export async function getPracticeSet(id: string) {
  const [set] = await db
    .select()
    .from(practiceSets)
    .where(and(eq(practiceSets.id, id), isNull(practiceSets.deletedAt)));

  return set ?? null;
}

// ============================================================
// Exercise CRUD Helpers
// ============================================================

export async function createExercise(data: {
  practiceSetId: string;
  type: string;
  language: string;
  definition: ExerciseDefinition;
  sortOrder?: number;
}) {
  const [exercise] = await db
    .insert(practiceExercises)
    .values({
      practiceSetId: data.practiceSetId,
      type: data.type as
        | "multiple_choice"
        | "fill_in_blank"
        | "matching"
        | "ordering"
        | "audio_recording"
        | "free_text",
      language: data.language as "cantonese" | "mandarin" | "both",
      definition: data.definition,
      sortOrder: data.sortOrder ?? 0,
    })
    .returning();

  return exercise;
}

export async function updateExercise(
  id: string,
  data: {
    language?: string;
    definition?: ExerciseDefinition;
    sortOrder?: number;
  }
) {
  const updates: Partial<typeof practiceExercises.$inferInsert> = {};

  if (data.language !== undefined) {
    updates.language = data.language as "cantonese" | "mandarin" | "both";
  }
  if (data.definition !== undefined) {
    updates.definition = data.definition;
  }
  if (data.sortOrder !== undefined) {
    updates.sortOrder = data.sortOrder;
  }

  const [updated] = await db
    .update(practiceExercises)
    .set(updates)
    .where(
      and(eq(practiceExercises.id, id), isNull(practiceExercises.deletedAt))
    )
    .returning();

  return updated ?? null;
}

export async function deleteExercise(id: string) {
  const [deleted] = await db
    .update(practiceExercises)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(practiceExercises.id, id), isNull(practiceExercises.deletedAt))
    )
    .returning();

  return deleted ?? null;
}

export async function listExercises(practiceSetId: string) {
  return db
    .select()
    .from(practiceExercises)
    .where(
      and(
        eq(practiceExercises.practiceSetId, practiceSetId),
        isNull(practiceExercises.deletedAt)
      )
    )
    .orderBy(asc(practiceExercises.sortOrder));
}

export async function getExercise(id: string) {
  const [exercise] = await db
    .select()
    .from(practiceExercises)
    .where(
      and(eq(practiceExercises.id, id), isNull(practiceExercises.deletedAt))
    );

  return exercise ?? null;
}

// ============================================================
// Lesson-level Practice Set (auto-create for audio lesson exercises)
// ============================================================

/**
 * Get or create a practice set linked to an audio lesson.
 * Uses practiceSetAssignments with targetType="lesson" to find existing set.
 * If none exists, creates one and links it.
 */
export async function getOrCreateLessonPracticeSet(
  lessonId: string,
  lessonTitle: string,
  createdBy: string,
) {
  // Check for existing assignment
  const existing = await db
    .select({
      assignmentId: practiceSetAssignments.id,
      practiceSetId: practiceSetAssignments.practiceSetId,
    })
    .from(practiceSetAssignments)
    .where(
      and(
        eq(practiceSetAssignments.targetType, "lesson"),
        eq(practiceSetAssignments.targetId, lessonId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    const set = await getPracticeSet(existing[0].practiceSetId);
    if (set) return set;
  }

  // Create new practice set for this lesson
  const [newSet] = await db
    .insert(practiceSets)
    .values({
      title: `Exercises: ${lessonTitle}`,
      description: `Interactive exercises for audio lesson "${lessonTitle}"`,
      status: "draft",
      createdBy,
    })
    .returning();

  // Link it to the lesson
  await db.insert(practiceSetAssignments).values({
    practiceSetId: newSet.id,
    targetType: "lesson",
    targetId: lessonId,
    assignedBy: createdBy,
  });

  return newSet;
}

/**
 * Find the practice set linked to a lesson (if any).
 */
export async function getLessonPracticeSet(lessonId: string) {
  const assignment = await db
    .select({
      practiceSetId: practiceSetAssignments.practiceSetId,
    })
    .from(practiceSetAssignments)
    .where(
      and(
        eq(practiceSetAssignments.targetType, "lesson"),
        eq(practiceSetAssignments.targetId, lessonId),
      ),
    )
    .limit(1);

  if (assignment.length === 0) return null;

  const set = await getPracticeSet(assignment[0].practiceSetId);
  return set;
}

// ============================================================
// Practice Set Duplication
// ============================================================

export async function duplicatePracticeSet(
  originalSetId: string,
  createdBy: string
) {
  // 1. Fetch original set
  const originalSet = await getPracticeSet(originalSetId);
  if (!originalSet) return null;

  // 2. Fetch original exercises
  const originalExercises = await listExercises(originalSetId);

  // 3. Create new set with "(Copy)" suffix, always draft
  const newSet = await createPracticeSet({
    title: `${originalSet.title} (Copy)`,
    description: originalSet.description ?? undefined,
    createdBy,
  });

  // 4. Copy all exercises into new set (preserving sort order)
  const newExercises = [];
  for (const ex of originalExercises) {
    const newEx = await createExercise({
      practiceSetId: newSet.id,
      type: ex.type,
      language: ex.language,
      definition: ex.definition as ExerciseDefinition,
      sortOrder: ex.sortOrder,
    });
    newExercises.push(newEx);
  }

  return { practiceSet: newSet, exercises: newExercises };
}

