import { redirect } from "next/navigation";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import {
  practiceAttempts,
  practiceExercises,
  practiceSets,
  users,
} from "@/db/schema";
import { eq, desc, isNotNull, gte, and, inArray } from "drizzle-orm";
import { ChevronLeft, Mic, AlertCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

import type { PronunciationWordResult } from "@/types/pronunciation";

/** Shape of per-exercise result stored in practiceAttempts.results JSONB */
interface AttemptExerciseResult {
  pronunciationDetails?: {
    overallScore?: number;
    accuracyScore?: number;
    fluencyScore?: number;
    completenessScore?: number;
    words?: PronunciationWordResult[];
    recognizedText?: string;
  };
  [key: string]: unknown;
}

/**
 * Score color utility: green >= 80, yellow >= 60, red < 60
 */
function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-yellow-400";
  return "text-red-400";
}

/**
 * Score background color for badges
 */
function scoreBgColor(score: number): string {
  if (score >= 80) return "bg-emerald-500/20 text-emerald-400";
  if (score >= 60) return "bg-yellow-500/20 text-yellow-400";
  return "bg-red-500/20 text-red-400";
}

/**
 * Character accuracy color: green >= 80, yellow >= 50, red < 50
 */
function charAccuracyColor(accuracy: number): string {
  if (accuracy >= 80) return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (accuracy >= 50) return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
  return "bg-red-500/20 text-red-300 border-red-500/30";
}

/**
 * Parsed pronunciation attempt for display
 */
interface PronunciationAttemptDisplay {
  attemptId: string;
  exerciseId: string;
  studentName: string | null;
  studentEmail: string;
  setTitle: string;
  completedAt: Date | null;
  targetPhrase: string;
  overallScore: number;
  accuracyScore: number;
  fluencyScore: number;
  completenessScore: number;
  words: PronunciationWordResult[];
  recognizedText: string;
}

/**
 * Coach Pronunciation Review page - displays student pronunciation assessment results.
 *
 * Features:
 * - List of completed pronunciation attempts from the last 30 days
 * - Shows student name, practice set, target phrase, scores, and date
 * - Per-character accuracy display with color coding
 * - Sub-scores for accuracy, fluency, and completeness
 *
 * Access Control:
 * - Requires minimum coach role
 * - Students are redirected to dashboard
 */
export default async function CoachPronunciationPage() {
  // Verify coach role
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    redirect("/dashboard");
  }

  // Get current user
  const currentUserData = await getCurrentUser();
  if (!currentUserData) {
    redirect("/sign-in");
  }

  let pronunciationAttempts: PronunciationAttemptDisplay[] = [];
  let queryError: string | null = null;

  try {
    // Query completed practice attempts from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentAttempts = await db
      .select({
        attemptId: practiceAttempts.id,
        userId: practiceAttempts.userId,
        practiceSetId: practiceAttempts.practiceSetId,
        results: practiceAttempts.results,
        score: practiceAttempts.score,
        completedAt: practiceAttempts.completedAt,
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
      .where(
        and(
          isNotNull(practiceAttempts.completedAt),
          gte(practiceAttempts.completedAt, thirtyDaysAgo)
        )
      )
      .orderBy(desc(practiceAttempts.completedAt))
      .limit(100);

    // Load exercise definitions for all practice sets in the results
    const setIds = [...new Set(recentAttempts.map((a) => a.practiceSetId))];
    const exercises =
      setIds.length > 0
        ? await db
            .select({
              id: practiceExercises.id,
              practiceSetId: practiceExercises.practiceSetId,
              definition: practiceExercises.definition,
            })
            .from(practiceExercises)
            .where(inArray(practiceExercises.practiceSetId, setIds))
        : [];
    const exerciseMap = new Map(
      exercises.map((e) => [e.id, e.definition])
    );

    // Extract pronunciation attempts from results JSONB
    pronunciationAttempts = recentAttempts.flatMap((attempt) => {
      const results = attempt.results as Record<string, AttemptExerciseResult> | null;
      if (!results) return [];
      return Object.entries(results)
        .filter((entry): entry is [string, AttemptExerciseResult & { pronunciationDetails: NonNullable<AttemptExerciseResult["pronunciationDetails"]> }] =>
          !!entry[1]?.pronunciationDetails
        )
        .map(([exerciseId, r]) => {
          const exerciseDef = exerciseMap.get(exerciseId) as Record<string, unknown> | undefined;
          const targetPhrase =
            (exerciseDef?.targetPhrase as string) ||
            (exerciseDef?.sampleAnswer as string) ||
            "(unknown)";
          return {
            attemptId: attempt.attemptId,
            exerciseId,
            studentName: attempt.studentName,
            studentEmail: attempt.studentEmail,
            setTitle: attempt.setTitle,
            completedAt: attempt.completedAt,
            targetPhrase,
            overallScore: r.pronunciationDetails.overallScore ?? 0,
            accuracyScore: r.pronunciationDetails.accuracyScore ?? 0,
            fluencyScore: r.pronunciationDetails.fluencyScore ?? 0,
            completenessScore: r.pronunciationDetails.completenessScore ?? 0,
            words: (r.pronunciationDetails.words ?? []) as PronunciationWordResult[],
            recognizedText: r.pronunciationDetails.recognizedText ?? "",
          };
        });
    });
  } catch (err) {
    console.error("Failed to load pronunciation attempts:", err);
    queryError = "Unable to load pronunciation data. Please try refreshing the page.";
  }

  return (
    <div className="container mx-auto px-4 py-8">
        {/* Back link */}
        <Link
          href="/coach"
          className="inline-flex items-center text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back to Coach Dashboard
        </Link>

        {/* Page subtitle */}
        <div className="mb-8">
          <p className="text-muted-foreground">
            Review student pronunciation scores and per-character accuracy
          </p>
        </div>

        {/* Error state */}
        {queryError && (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-sm text-red-400">{queryError}</p>
          </div>
        )}

        {/* Empty state */}
        {!queryError && pronunciationAttempts.length === 0 && (
          <div className="text-center py-16 max-w-md mx-auto">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">
              No pronunciation attempts yet
            </h2>
            <p className="text-muted-foreground mt-2">
              Students haven&apos;t completed any pronunciation exercises in the
              last 30 days.
            </p>
          </div>
        )}

        {/* Pronunciation attempts list */}
        {!queryError && pronunciationAttempts.length > 0 && (
          <div className="space-y-4 max-w-4xl">
            {pronunciationAttempts.map((attempt, index) => (
              <Card
                key={`${attempt.attemptId}-${attempt.exerciseId}-${index}`}
                className="bg-card border-border"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-base font-semibold text-foreground">
                        {attempt.studentName || attempt.studentEmail}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {attempt.setTitle}
                      </p>
                    </div>
                    <div className="text-right">
                      <span
                        className={`text-2xl font-bold ${scoreColor(attempt.overallScore)}`}
                      >
                        {attempt.overallScore}
                      </span>
                      <p className="text-xs text-muted-foreground">Overall</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Target phrase */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Target Phrase</p>
                    <p className="text-cyan-400 font-mono text-lg">
                      {attempt.targetPhrase}
                    </p>
                  </div>

                  {/* Per-character accuracy */}
                  {attempt.words.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">
                        Per-Character Accuracy
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {attempt.words.map((word, wordIndex) => (
                          <span
                            key={`${word.word}-${wordIndex}`}
                            className={`inline-flex items-center justify-center px-2 py-1 rounded border text-sm font-mono ${charAccuracyColor(word.accuracyScore)}`}
                            title={`${word.word}: ${word.accuracyScore}% accuracy (${word.errorType})`}
                          >
                            {word.word}
                            <span className="ml-1 text-xs opacity-75">
                              {word.accuracyScore}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-scores row */}
                  <div className="flex flex-wrap gap-3">
                    <span
                      className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${scoreBgColor(attempt.accuracyScore)}`}
                    >
                      Accuracy: {attempt.accuracyScore}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${scoreBgColor(attempt.fluencyScore)}`}
                    >
                      Fluency: {attempt.fluencyScore}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-sm px-2 py-0.5 rounded ${scoreBgColor(attempt.completenessScore)}`}
                    >
                      Completeness: {attempt.completenessScore}
                    </span>
                  </div>

                  {/* Recognized text and date */}
                  <div className="flex items-center justify-between text-sm">
                    {attempt.recognizedText && (
                      <p className="text-muted-foreground">
                        Recognized: &ldquo;{attempt.recognizedText}&rdquo;
                      </p>
                    )}
                    {attempt.completedAt && (
                      <p className="text-muted-foreground text-xs">
                        {formatDistanceToNow(new Date(attempt.completedAt), {
                          addSuffix: true,
                        })}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
  );
}
