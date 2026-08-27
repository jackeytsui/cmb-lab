import "server-only";

import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  practiceAttempts,
  practiceExercises,
  practiceSetAssignments,
  practiceSets,
} from "@/db/schema";

export type AudioLessonExerciseSummary = {
  hasExercises: boolean;
  practiceSetId: string | null;
  bestScore: number | null;
};

/**
 * Load exercise availability and the learner's best score for an entire audio
 * catalogue in a few set-based queries. This replaces one request per lesson.
 */
export async function loadAudioLessonExerciseSummaries(
  userId: string,
  lessonIds: string[],
): Promise<Map<string, AudioLessonExerciseSummary>> {
  const summaries = new Map<string, AudioLessonExerciseSummary>();
  if (lessonIds.length === 0) return summaries;

  const assignments = await db
    .select({
      lessonId: practiceSetAssignments.targetId,
      practiceSetId: practiceSets.id,
    })
    .from(practiceSetAssignments)
    .innerJoin(
      practiceSets,
      eq(practiceSetAssignments.practiceSetId, practiceSets.id),
    )
    .where(
      and(
        eq(practiceSetAssignments.targetType, "lesson"),
        inArray(practiceSetAssignments.targetId, lessonIds),
        eq(practiceSets.status, "published"),
        isNull(practiceSets.deletedAt),
      ),
    )
    .orderBy(asc(practiceSetAssignments.createdAt));

  // getLessonPracticeSet uses the first lesson assignment, so mirror it here.
  const assignmentByLesson = new Map<string, string>();
  for (const assignment of assignments) {
    if (!assignmentByLesson.has(assignment.lessonId)) {
      assignmentByLesson.set(assignment.lessonId, assignment.practiceSetId);
    }
  }

  const practiceSetIds = [...new Set(assignmentByLesson.values())];
  if (practiceSetIds.length === 0) return summaries;

  const [exerciseCounts, attemptRows] = await Promise.all([
    db
      .select({
        practiceSetId: practiceExercises.practiceSetId,
        exerciseCount: count(practiceExercises.id),
      })
      .from(practiceExercises)
      .where(
        and(
          inArray(practiceExercises.practiceSetId, practiceSetIds),
          isNull(practiceExercises.deletedAt),
        ),
      )
      .groupBy(practiceExercises.practiceSetId),
    db
      .select({
        practiceSetId: practiceAttempts.practiceSetId,
        bestScore: sql<number | null>`max(${practiceAttempts.score})`,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          inArray(practiceAttempts.practiceSetId, practiceSetIds),
        ),
      )
      .groupBy(practiceAttempts.practiceSetId),
  ]);

  const exerciseCountBySet = new Map(
    exerciseCounts.map((row) => [row.practiceSetId, Number(row.exerciseCount)]),
  );
  const bestScoreBySet = new Map(
    attemptRows.map((row) => [row.practiceSetId, row.bestScore]),
  );

  for (const [lessonId, practiceSetId] of assignmentByLesson) {
    const hasExercises = (exerciseCountBySet.get(practiceSetId) ?? 0) > 0;
    summaries.set(lessonId, {
      hasExercises,
      practiceSetId: hasExercises ? practiceSetId : null,
      bestScore: hasExercises ? (bestScoreBySet.get(practiceSetId) ?? null) : null,
    });
  }

  return summaries;
}
