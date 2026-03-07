import { db } from "@/db";
import { practiceSets, practiceExercises } from "@/db/schema";
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

