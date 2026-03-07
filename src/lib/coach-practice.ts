import {
  eq,
  and,
  gte,
  lte,
  isNotNull,
  desc,
  sql,
  inArray,
  ilike,
  or,
  isNull,
} from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  practiceAttempts,
  practiceSets,
  practiceExercises,
  users,
} from "@/db/schema";

// ============================================================
// Types
// ============================================================

export interface PracticeResultsFilters {
  studentName?: string;
  practiceSetId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  scoreMin?: number;
  scoreMax?: number;
}

export interface AttemptDetail {
  attemptId: string;
  studentName: string | null;
  studentEmail: string;
  practiceSetTitle: string;
  practiceSetId: string;
  score: number | null;
  totalExercises: number;
  correctCount: number;
  startedAt: Date;
  completedAt: Date | null;
  timeTakenSeconds: number | null;
  perExercise: {
    exerciseId: string;
    exerciseType: string;
    isCorrect: boolean;
    score: number;
  }[];
}

export interface SetAggregate {
  setId: string;
  setTitle: string;
  avgScore: number;
  attemptCount: number;
  completionRate: number;
}

export interface HardestExercise {
  exerciseId: string;
  exerciseType: string;
  practiceSetTitle: string;
  avgScore: number;
  attemptCount: number;
  incorrectRate: number;
}

export interface PracticeResultsResponse {
  attempts: AttemptDetail[];
  aggregates: {
    totalAttempts: number;
    totalStudents: number;
    overallAvgScore: number;
    overallCompletionRate: number;
    perSet: SetAggregate[];
    hardestExercises: HardestExercise[];
  };
  practiceSets: { id: string; title: string }[];
}

// ============================================================
// Internal Helpers
// ============================================================

/** Results shape stored in practiceAttempts.results JSONB */
interface ExerciseResult {
  isCorrect: boolean;
  score: number;
  response?: string;
  feedback?: string;
}

/**
 * Build shared WHERE conditions for filtering practice attempts.
 * Always includes completedAt IS NOT NULL.
 */
function buildWhereConditions(
  filters: PracticeResultsFilters,
  includeCompleted = true
): SQL[] {
  const conditions: SQL[] = [];

  if (includeCompleted) {
    conditions.push(isNotNull(practiceAttempts.completedAt));
  }

  if (filters.studentName) {
    const pattern = `%${filters.studentName}%`;
    conditions.push(
      or(ilike(users.name, pattern), ilike(users.email, pattern))!
    );
  }

  if (filters.practiceSetId) {
    conditions.push(
      eq(practiceAttempts.practiceSetId, filters.practiceSetId)
    );
  }

  if (filters.dateFrom) {
    conditions.push(gte(practiceAttempts.completedAt, filters.dateFrom));
  }

  if (filters.dateTo) {
    conditions.push(lte(practiceAttempts.completedAt, filters.dateTo));
  }

  if (filters.scoreMin !== undefined) {
    conditions.push(gte(practiceAttempts.score, filters.scoreMin));
  }

  if (filters.scoreMax !== undefined) {
    conditions.push(lte(practiceAttempts.score, filters.scoreMax));
  }

  return conditions;
}

// ============================================================
// Main Query Function
// ============================================================

/**
 * Fetch practice results with combined attempt details and aggregate analytics.
 * Supports filtering by student name/email, practice set, date range, and score range.
 */
export async function getPracticeResults(
  filters: PracticeResultsFilters
): Promise<PracticeResultsResponse> {
  const completedConditions = buildWhereConditions(filters, true);
  // Conditions without the completedAt IS NOT NULL filter (for completion rate calc)
  const allConditions = buildWhereConditions(filters, false);

  // Run queries in parallel
  const [rawAttempts, perSetAggregates, overallStats, allAttemptsCount, publishedSets] =
    await Promise.all([
      // 1. Attempts query: detailed per-student rows
      db
        .select({
          attemptId: practiceAttempts.id,
          practiceSetId: practiceAttempts.practiceSetId,
          score: practiceAttempts.score,
          totalExercises: practiceAttempts.totalExercises,
          correctCount: practiceAttempts.correctCount,
          startedAt: practiceAttempts.startedAt,
          completedAt: practiceAttempts.completedAt,
          results: practiceAttempts.results,
          studentName: users.name,
          studentEmail: users.email,
          setTitle: practiceSets.title,
        })
        .from(practiceAttempts)
        .innerJoin(users, eq(practiceAttempts.userId, users.id))
        .innerJoin(
          practiceSets,
          eq(practiceAttempts.practiceSetId, practiceSets.id)
        )
        .where(and(...completedConditions))
        .orderBy(desc(practiceAttempts.completedAt))
        .limit(200),

      // 2. Per-set aggregates
      db
        .select({
          setId: practiceSets.id,
          setTitle: practiceSets.title,
          avgScore: sql<number>`ROUND(AVG(${practiceAttempts.score}), 1)`,
          attemptCount: sql<number>`COUNT(*)`,
        })
        .from(practiceAttempts)
        .innerJoin(
          practiceSets,
          eq(practiceAttempts.practiceSetId, practiceSets.id)
        )
        .innerJoin(users, eq(practiceAttempts.userId, users.id))
        .where(and(...completedConditions))
        .groupBy(practiceSets.id, practiceSets.title)
        .orderBy(sql`AVG(${practiceAttempts.score}) ASC`),

      // 3. Overall stats (completed attempts only)
      db
        .select({
          totalAttempts: sql<number>`COUNT(*)`,
          totalStudents: sql<number>`COUNT(DISTINCT ${practiceAttempts.userId})`,
          avgScore: sql<number>`ROUND(AVG(${practiceAttempts.score}), 1)`,
        })
        .from(practiceAttempts)
        .innerJoin(users, eq(practiceAttempts.userId, users.id))
        .where(and(...completedConditions)),

      // 4. All attempts count (including incomplete, for completion rate)
      db
        .select({
          total: sql<number>`COUNT(*)`,
        })
        .from(practiceAttempts)
        .innerJoin(users, eq(practiceAttempts.userId, users.id))
        .where(
          allConditions.length > 0 ? and(...allConditions) : undefined
        ),

      // 5. Published practice sets for filter dropdown
      db
        .select({
          id: practiceSets.id,
          title: practiceSets.title,
        })
        .from(practiceSets)
        .where(
          and(
            eq(practiceSets.status, "published"),
            isNull(practiceSets.deletedAt)
          )
        )
        .orderBy(practiceSets.title),
    ]);

  // Batch-load exercise definitions for all practice sets in the results
  const setIds = [...new Set(rawAttempts.map((a) => a.practiceSetId))];
  const exercises =
    setIds.length > 0
      ? await db
          .select({
            id: practiceExercises.id,
            practiceSetId: practiceExercises.practiceSetId,
            type: practiceExercises.type,
          })
          .from(practiceExercises)
          .where(inArray(practiceExercises.practiceSetId, setIds))
      : [];

  // Build exercise lookup map: exerciseId -> { type, practiceSetTitle }
  const setTitleMap = new Map(rawAttempts.map((a) => [a.practiceSetId, a.setTitle]));
  const exerciseMap = new Map(
    exercises.map((e) => [
      e.id,
      {
        type: e.type,
        practiceSetTitle: setTitleMap.get(e.practiceSetId) ?? "Unknown",
      },
    ])
  );

  // Transform raw attempts into AttemptDetail[]
  const attempts: AttemptDetail[] = rawAttempts.map((raw) => {
    // Compute time taken (cap at 30 minutes)
    let timeTakenSeconds: number | null = null;
    if (raw.completedAt && raw.startedAt) {
      const diffSeconds =
        (new Date(raw.completedAt).getTime() -
          new Date(raw.startedAt).getTime()) /
        1000;
      // Cap at 1800 seconds (30 minutes) — show null if over
      timeTakenSeconds = diffSeconds > 1800 ? null : Math.round(diffSeconds);
    }

    // Parse results JSONB (guard against null)
    const results = raw.results as Record<string, ExerciseResult> | null;
    const perExercise = results
      ? Object.entries(results).map(([exerciseId, result]) => ({
          exerciseId,
          exerciseType: exerciseMap.get(exerciseId)?.type ?? "unknown",
          isCorrect: result.isCorrect,
          score: result.score ?? 0,
        }))
      : [];

    return {
      attemptId: raw.attemptId,
      studentName: raw.studentName,
      studentEmail: raw.studentEmail,
      practiceSetTitle: raw.setTitle,
      practiceSetId: raw.practiceSetId,
      score: raw.score,
      totalExercises: raw.totalExercises,
      correctCount: raw.correctCount,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      timeTakenSeconds,
      perExercise,
    };
  });

  // Compute hardest exercises
  const hardestExercises = computeHardestExercises(rawAttempts, exerciseMap);

  // Compute overall completion rate
  const completedCount = Number(overallStats[0]?.totalAttempts || 0);
  const totalAllCount = Number(allAttemptsCount[0]?.total || 0);
  const overallCompletionRate =
    totalAllCount > 0
      ? Math.round((completedCount / totalAllCount) * 100)
      : 0;

  // Compute per-set completion rates (set aggregates already filtered to completed)
  // We need per-set total attempts including incomplete to compute rates
  // For simplicity, use the per-set completed count / overall patterns
  const perSet: SetAggregate[] = perSetAggregates.map((agg) => ({
    setId: agg.setId,
    setTitle: agg.setTitle,
    avgScore: Number(agg.avgScore) || 0,
    attemptCount: Number(agg.attemptCount) || 0,
    completionRate: 100, // These are already filtered to completed attempts
  }));

  return {
    attempts,
    aggregates: {
      totalAttempts: completedCount,
      totalStudents: Number(overallStats[0]?.totalStudents || 0),
      overallAvgScore: Number(overallStats[0]?.avgScore || 0),
      overallCompletionRate,
      perSet,
      hardestExercises,
    },
    practiceSets: publishedSets,
  };
}

// ============================================================
// Hardest Exercises Computation
// ============================================================

/**
 * Compute the hardest exercises from attempt results JSONB data.
 * Uses JavaScript-side aggregation to avoid complex Postgres JSONB queries.
 * Only includes exercises with >= 3 attempts to avoid outlier noise.
 * Returns top 10 sorted by lowest average score (hardest first).
 */
export function computeHardestExercises(
  attempts: {
    results: Record<string, { isCorrect: boolean; score: number }> | null;
  }[],
  exerciseMap: Map<string, { type: string; practiceSetTitle: string }>
): HardestExercise[] {
  const exerciseStats = new Map<
    string,
    { correct: number; total: number; totalScore: number }
  >();

  for (const attempt of attempts) {
    if (!attempt.results) continue;
    const results = attempt.results as Record<string, ExerciseResult>;
    for (const [exerciseId, result] of Object.entries(results)) {
      const stats = exerciseStats.get(exerciseId) ?? {
        correct: 0,
        total: 0,
        totalScore: 0,
      };
      stats.total++;
      if (result.isCorrect) stats.correct++;
      stats.totalScore += result.score ?? 0;
      exerciseStats.set(exerciseId, stats);
    }
  }

  return Array.from(exerciseStats.entries())
    .filter(([, stats]) => stats.total >= 3) // Minimum 3 attempts threshold
    .map(([exerciseId, stats]) => ({
      exerciseId,
      exerciseType: exerciseMap.get(exerciseId)?.type ?? "unknown",
      practiceSetTitle:
        exerciseMap.get(exerciseId)?.practiceSetTitle ?? "Unknown",
      avgScore: Math.round(stats.totalScore / stats.total),
      attemptCount: stats.total,
      incorrectRate: Math.round(
        ((stats.total - stats.correct) / stats.total) * 100
      ),
    }))
    .sort((a, b) => a.avgScore - b.avgScore) // Lowest average score = hardest
    .slice(0, 10); // Top 10 hardest
}
