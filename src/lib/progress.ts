import { db } from "@/db";
import {
  lessonProgress,
  interactions,
  interactionAttempts,
} from "@/db/schema";
import type { LessonProgress } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  filterInteractionsByPreference,
  type LanguagePreference,
} from "@/lib/interactions";

/**
 * Completion status for a lesson.
 * Tracks video and interaction completion separately.
 */
export interface CompletionStatus {
  /** True if both video and interactions are complete */
  isComplete: boolean;
  /** True if video watched to 95%+ */
  videoComplete: boolean;
  /** True if all required interactions passed */
  interactionsComplete: boolean;
  /** Current video watch percentage (0-100) */
  videoWatchedPercent: number;
  /** Number of interactions passed with correct answer */
  interactionsPassed: number;
  /** Total number of required interactions (filtered by language) */
  interactionsRequired: number;
}

interface UpsertProgressInput {
  userId: string;
  lessonId: string;
  videoWatchedPercent?: number;
  interactionCompleted?: boolean;
}

/**
 * Create or update lesson progress record.
 * Uses atomic operations to prevent race conditions:
 * - GREATEST() ensures video percent only increases
 * - COALESCE() sets timestamps only once
 *
 * @param input - Progress update data
 * @returns Updated or created progress record
 */
export async function upsertLessonProgress(
  input: UpsertProgressInput
): Promise<LessonProgress> {
  const { userId, lessonId, videoWatchedPercent, interactionCompleted } = input;

  // Build dynamic set clause for conflict update
  // Always update lastAccessedAt
  const setClause: Record<string, unknown> = {
    lastAccessedAt: new Date(),
  };

  // Handle video progress update
  if (videoWatchedPercent !== undefined) {
    // Only increase, never decrease (GREATEST ensures monotonic progress)
    setClause.videoWatchedPercent = sql`GREATEST(${lessonProgress.videoWatchedPercent}, ${videoWatchedPercent})`;

    // Set videoCompletedAt when 60%+ reached (only set once via COALESCE)
    if (videoWatchedPercent >= 60) {
      setClause.videoCompletedAt = sql`COALESCE(${lessonProgress.videoCompletedAt}, NOW())`;
    }
  }

  // Handle interaction completion
  if (interactionCompleted) {
    setClause.interactionsCompleted = sql`${lessonProgress.interactionsCompleted} + 1`;
  }

  const [progress] = await db
    .insert(lessonProgress)
    .values({
      userId,
      lessonId,
      videoWatchedPercent: videoWatchedPercent ?? 0,
      interactionsCompleted: interactionCompleted ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [lessonProgress.userId, lessonProgress.lessonId],
      set: setClause,
    })
    .returning();

  return progress;
}

/**
 * Check lesson completion status for a user.
 * Completion requires BOTH:
 * 1. Video watched to 60%+ (videoCompletedAt is set)
 * 2. All required interactions passed (filtered by language preference)
 *
 * @param userId - User ID to check
 * @param lessonId - Lesson ID to check
 * @param languagePreference - User's language preference for filtering interactions
 * @returns Completion status with detailed breakdown
 */
export async function checkLessonCompletion(
  userId: string,
  lessonId: string,
  languagePreference: LanguagePreference
): Promise<CompletionStatus> {
  // Get current progress record (may not exist yet)
  const progress = await db.query.lessonProgress.findFirst({
    where: and(
      eq(lessonProgress.userId, userId),
      eq(lessonProgress.lessonId, lessonId)
    ),
  });

  // Get all interactions for this lesson
  const allInteractions = await db.query.interactions.findMany({
    where: eq(interactions.lessonId, lessonId),
  });

  // Filter interactions based on user's language preference
  // This ensures completion criteria matches what the user actually sees
  const requiredInteractions = filterInteractionsByPreference(
    allInteractions,
    languagePreference
  );

  // Get interaction IDs that have at least one correct attempt by this user
  const correctAttempts = await db
    .select({ interactionId: interactionAttempts.interactionId })
    .from(interactionAttempts)
    .where(
      and(
        eq(interactionAttempts.userId, userId),
        eq(interactionAttempts.isCorrect, true)
      )
    )
    .groupBy(interactionAttempts.interactionId);

  // Create set of passed interaction IDs for O(1) lookup
  const passedInteractionIds = new Set(
    correctAttempts.map((r) => r.interactionId)
  );

  // Count how many required interactions have been passed
  const interactionsPassed = requiredInteractions.filter((interaction) =>
    passedInteractionIds.has(interaction.id)
  ).length;

  // Determine completion state
  const videoComplete = !!progress?.videoCompletedAt;
  const interactionsRequired = requiredInteractions.length;
  const interactionsComplete =
    interactionsRequired === 0 || interactionsPassed >= interactionsRequired;
  const isComplete = videoComplete && interactionsComplete;

  return {
    isComplete,
    videoComplete,
    interactionsComplete,
    videoWatchedPercent: progress?.videoWatchedPercent ?? 0,
    interactionsPassed,
    interactionsRequired,
  };
}
