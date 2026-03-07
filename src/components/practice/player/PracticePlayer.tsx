"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  BookOpen,
  Loader2,
} from "lucide-react";
import type { PracticeSet, PracticeExercise } from "@/db/schema/practice";
import { usePracticePlayer } from "@/hooks/usePracticePlayer";
import { useCelebration } from "@/hooks/useCelebration";
import { CelebrationOverlay } from "@/components/celebrations/CelebrationOverlay";
import { XP_AMOUNTS } from "@/lib/xp";
import { ExerciseRenderer } from "./ExerciseRenderer";
import { PracticeFeedback } from "./PracticeFeedback";
import { PracticeResults } from "./PracticeResults";
import { Progress } from "@/components/ui/progress";

// ============================================================
// Props
// ============================================================

interface PracticePlayerProps {
  practiceSet: PracticeSet;
  exercises: PracticeExercise[];
  userId: string;
  nextAction?: { label: string; href: string };
}

// ============================================================
// Language badge helper
// ============================================================

function LanguageBadge({ language }: { language: string }) {
  const colorMap: Record<string, string> = {
    cantonese: "bg-teal-500/20 text-teal-300 border-teal-500/50",
    mandarin: "bg-amber-500/20 text-amber-300 border-amber-500/50",
    both: "bg-zinc-500/20 text-zinc-300 border-zinc-500/50",
  };

  const label =
    language === "cantonese"
      ? "Cantonese"
      : language === "mandarin"
        ? "Mandarin"
        : "Both";

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded border ${colorMap[language] ?? colorMap.both}`}
    >
      {label}
    </span>
  );
}

// ============================================================
// PracticePlayer
// ============================================================

export function PracticePlayer({
  practiceSet,
  exercises,
  userId: _userId,
  nextAction,
}: PracticePlayerProps) {
  const player = usePracticePlayer(exercises);

  // ----------------------------------------------------------
  // Celebration state
  // ----------------------------------------------------------

  const [showCelebration, setShowCelebration] = useState(true);
  const celebrationFiredRef = useRef(false);

  const computePracticeXP = useCallback(
    (score: number, exerciseCount: number) => {
      const perExercise = Math.round(
        XP_AMOUNTS.practice_exercise_min +
          (score / 100) *
            (XP_AMOUNTS.practice_exercise_max -
              XP_AMOUNTS.practice_exercise_min)
      );
      const baseXP = perExercise * exerciseCount;
      const perfectBonus = score >= 100 ? XP_AMOUNTS.practice_perfect : 0;
      return baseXP + perfectBonus;
    },
    []
  );

  const celebration = useCelebration({ score: player.totalScore });

  useEffect(() => {
    if (player.state.status === "completed" && !celebrationFiredRef.current) {
      celebrationFiredRef.current = true;
      celebration.show();
    }
  }, [player.state.status, celebration]);

  const handleCelebrationDismiss = useCallback(() => {
    setShowCelebration(false);
    celebration.dismiss();
  }, [celebration]);

  // ----------------------------------------------------------
  // Attempt persistence: create on start, update on complete
  // ----------------------------------------------------------

  const handleStart = useCallback(async () => {
    try {
      // 1. Check for existing active attempt
      const activeRes = await fetch(`/api/practice/${practiceSet.id}/attempts/active`);
      if (activeRes.ok) {
        const { attempt } = await activeRes.json();
        if (attempt) {
          // Resume existing attempt
          player.loadAttempt(
            attempt.id,
            attempt.answers || {},
            attempt.results || {}
          );
          return;
        }
      }

      // 2. Start new attempt if none found
      player.start();

      const res = await fetch(`/api/practice/${practiceSet.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalExercises: exercises.length }),
      });
      if (res.ok) {
        const data = await res.json();
        player.setAttemptId(data.attempt.id);
      }
    } catch {
      // Fallback: just start locally if network fails
      console.error("Failed to initialize practice attempt");
      if (player.state.status === "not_started") {
        player.start();
      }
    }
  }, [player, practiceSet.id, exercises.length]);

  const handleComplete = useCallback(async () => {
    player.complete();

    // Persist final results
    if (player.state.attemptId) {
      try {
        await fetch(`/api/practice/${practiceSet.id}/attempts`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attemptId: player.state.attemptId,
            score: player.totalScore,
            correctCount: player.totalCorrect,
            results: player.state.results,
            completedAt: new Date().toISOString(),
          }),
        });
      } catch {
        console.error("Failed to save practice results");
      }
    }
  }, [player, practiceSet.id]);

  const handleRetryAll = useCallback(async () => {
    // Reset celebration state so it fires again on next completion
    setShowCelebration(true);
    celebrationFiredRef.current = false;
    celebration.reset();

    player.retryAll();

    // Create a new attempt for the retry
    try {
      const res = await fetch(`/api/practice/${practiceSet.id}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ totalExercises: exercises.length }),
      });
      if (res.ok) {
        const data = await res.json();
        player.setAttemptId(data.attempt.id);
      }
    } catch {
      console.error("Failed to create retry attempt");
    }
  }, [player, practiceSet.id, exercises.length, celebration]);

  // Handle exercise submission (wraps hook's handleSubmit with exerciseId binding)
  const handleExerciseSubmit = useCallback(
    async (response: unknown) => {
      if (player.currentExercise) {
        // Update local state
        player.handleSubmit(player.currentExercise.id, response);

        // Auto-save to server if we have an attempt ID
        if (player.state.attemptId) {
          try {
            await fetch(`/api/practice/${practiceSet.id}/attempts/${player.state.attemptId}/save`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                exerciseId: player.currentExercise.id,
                response,
                // We could also send partial results/score if grading is done locally/optimistically
              }),
            });
          } catch {
            console.error("Failed to auto-save answer");
          }
        }
      }
    },
    [player, practiceSet.id]
  );

  // Estimated time: ~1 min per exercise
  const estimatedMinutes = Math.max(1, Math.ceil(exercises.length * 1));

  // ----------------------------------------------------------
  // Render: Start Screen
  // ----------------------------------------------------------

  if (player.state.status === "not_started") {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="p-8 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20">
            <BookOpen className="h-8 w-8 text-blue-400" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-white">
              {practiceSet.title}
            </h1>
            {practiceSet.description && (
              <p className="text-zinc-400 mt-2">{practiceSet.description}</p>
            )}
          </div>

          <div className="flex items-center justify-center gap-6 text-sm text-zinc-400">
            <span>{exercises.length} exercises</span>
            <span className="text-zinc-600">|</span>
            <span>~{estimatedMinutes} min</span>
          </div>

          <button
            type="button"
            onClick={handleStart}
            className="px-8 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors inline-flex items-center gap-2"
          >
            <Play className="h-5 w-5" />
            Start Practice
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render: Results Screen
  // ----------------------------------------------------------

  if (player.state.status === "completed") {
    return (
      <div className="max-w-2xl mx-auto">
        <AnimatePresence>
          {celebration.isVisible && showCelebration && (
            <CelebrationOverlay
              type="practice"
              score={player.totalScore}
              xpEarned={computePracticeXP(player.totalScore, exercises.length)}
              streakCount={0}
              isFirstAttempt={!player.state.attemptId}
              correctCount={player.totalCorrect}
              totalExercises={exercises.length}
              practiceSetId={practiceSet.id}
              onDismiss={handleCelebrationDismiss}
              onRetry={() => {
                handleCelebrationDismiss();
                handleRetryAll();
              }}
              nextAction={nextAction}
            />
          )}
        </AnimatePresence>
        {(!celebration.isVisible || !showCelebration) && (
          <PracticeResults
            practiceSet={practiceSet}
            exercises={exercises}
            results={player.state.results}
            responses={player.state.responses}
            startedAt={player.state.startedAt}
            completedAt={player.state.completedAt}
            onRetryAll={handleRetryAll}
            onRetryExercise={player.retryExercise}
            nextAction={nextAction}
          />
        )}
      </div>
    );
  }

  // ----------------------------------------------------------
  // Render: Exercise View (in_progress)
  // ----------------------------------------------------------

  const currentExercise = player.currentExercise;
  if (!currentExercise) return null;

  const showViewResults = player.isLastExercise && player.hasResult;
  const canGoNext =
    !player.isLastExercise && !player.state.isGrading && player.hasResult;
  const canGoPrev = !player.isFirstExercise && !player.state.isGrading;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white truncate pr-4">
            {practiceSet.title}
          </h1>
          <span className="text-zinc-400 text-sm shrink-0">
            Exercise {player.state.currentIndex + 1} of {exercises.length}
          </span>
        </div>
        <Progress value={player.progress} className="h-2" />
      </div>

      {/* Language badge */}
      <div>
        <LanguageBadge language={currentExercise.language} />
      </div>

      {/* Exercise content with animation */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentExercise.id}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.2 }}
        >
          <ExerciseRenderer
            exercise={currentExercise}
            onSubmit={handleExerciseSubmit}
            disabled={player.state.isGrading || player.hasResult}
            savedAnswer={player.state.responses[currentExercise.id]}
          />
        </motion.div>
      </AnimatePresence>

      {/* Grading indicator */}
      {player.state.isGrading && (
        <div className="flex items-center justify-center gap-2 text-zinc-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Grading...</span>
        </div>
      )}

      {/* Feedback (shown after grading) */}
      {player.hasResult && player.state.results[currentExercise.id] && (
        <PracticeFeedback result={player.state.results[currentExercise.id]} />
      )}

      {/* Navigation bar */}
      <div className="flex items-center gap-3 pt-2">
        {/* Previous button */}
        <button
          type="button"
          onClick={player.goPrev}
          disabled={!canGoPrev}
          className="px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </button>

        {/* Exercise dot indicators */}
        <div className="flex-1 flex items-center justify-center gap-1.5 overflow-x-auto">
          {exercises.map((ex, i) => {
            const isAnswered = !!player.state.results[ex.id];
            const isCurrent = i === player.state.currentIndex;

            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => player.jumpTo(i)}
                disabled={player.state.isGrading}
                className={`w-2.5 h-2.5 rounded-full transition-all shrink-0 ${
                  isCurrent
                    ? "bg-blue-500 scale-125"
                    : isAnswered
                      ? "bg-green-500/70 hover:bg-green-500"
                      : "bg-zinc-600 hover:bg-zinc-500"
                }`}
                aria-label={`Exercise ${i + 1}`}
              />
            );
          })}
        </div>

        {/* Next / View Results button */}
        {showViewResults ? (
          <button
            type="button"
            onClick={handleComplete}
            className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors flex items-center gap-1"
          >
            View Results
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={player.goNext}
            disabled={!canGoNext}
            className="px-4 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center gap-1"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}