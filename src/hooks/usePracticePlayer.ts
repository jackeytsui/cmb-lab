"use client";

import { useReducer, useCallback, useMemo } from "react";
import type { PracticeExercise } from "@/db/schema/practice";
import type { ExerciseDefinition } from "@/types/exercises";
import {
  gradeMultipleChoice,
  gradeFillInBlank,
  gradeMatching,
  gradeOrdering,
  type GradeResult,
} from "@/lib/practice-grading";

// ============================================================
// Types
// ============================================================

export interface PlayerState {
  exercises: PracticeExercise[];
  currentIndex: number;
  responses: Record<string, unknown>; // exerciseId -> student response data
  results: Record<string, GradeResult>; // exerciseId -> grading result
  status: "not_started" | "in_progress" | "completed";
  isGrading: boolean; // true while waiting for AI grade
  startedAt: Date | null;
  completedAt: Date | null;
  attemptId: string | null; // set after first API call
}

type PlayerAction =
  | { type: "START" }
  | {
      type: "SUBMIT_ANSWER";
      exerciseId: string;
      response: unknown;
      result: GradeResult;
    }
  | { type: "SET_GRADING"; isGrading: boolean }
  | { type: "NEXT_EXERCISE" }
  | { type: "PREV_EXERCISE" }
  | { type: "JUMP_TO"; index: number }
  | { type: "COMPLETE"; completedAt: Date }
  | { type: "RETRY_EXERCISE"; exerciseId: string }
  | { type: "RETRY_ALL" }
  | { type: "SET_ATTEMPT_ID"; attemptId: string }
  | { type: "LOAD_ATTEMPT"; attemptId: string; answers: Record<string, unknown>; results: Record<string, GradeResult> };

// ============================================================
// Reducer
// ============================================================

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "START": {
      return {
        ...state,
        status: "in_progress",
        startedAt: new Date(),
      };
    }

    case "LOAD_ATTEMPT": {
      // Find the next unanswered exercise index
      let firstUnansweredIndex = 0;
      for (let i = 0; i < state.exercises.length; i++) {
        const exId = state.exercises[i].id;
        if (!action.answers[exId]) {
          firstUnansweredIndex = i;
          break;
        }
      }

      return {
        ...state,
        status: "in_progress",
        attemptId: action.attemptId,
        responses: action.answers,
        results: action.results, // If we had graded results stored
        currentIndex: firstUnansweredIndex,
        // If answers exist but no results, we might need to re-grade or treat as pending.
        // For auto-save, we mainly care about `responses`.
        // If we only saved `answers` (raw), `results` might be empty.
        // For deterministic exercises, we could re-grade on load.
      };
    }

    case "SUBMIT_ANSWER": {
      const newResponses = {
        ...state.responses,
        [action.exerciseId]: action.response,
      };
      const newResults = {
        ...state.results,
        [action.exerciseId]: action.result,
      };

      // Auto-complete if all exercises have been graded
      const allGraded =
        state.exercises.length > 0 &&
        state.exercises.every((ex) => newResults[ex.id] !== undefined);

      return {
        ...state,
        responses: newResponses,
        results: newResults,
        status: allGraded ? "completed" : state.status,
        completedAt: allGraded ? new Date() : state.completedAt,
      };
    }

    case "SET_GRADING": {
      return {
        ...state,
        isGrading: action.isGrading,
      };
    }

    case "NEXT_EXERCISE": {
      return {
        ...state,
        currentIndex: Math.min(
          state.currentIndex + 1,
          state.exercises.length - 1
        ),
      };
    }

    case "PREV_EXERCISE": {
      return {
        ...state,
        currentIndex: Math.max(state.currentIndex - 1, 0),
      };
    }

    case "JUMP_TO": {
      return {
        ...state,
        currentIndex: Math.max(
          0,
          Math.min(action.index, state.exercises.length - 1)
        ),
      };
    }

    case "COMPLETE": {
      return {
        ...state,
        status: "completed",
        completedAt: action.completedAt,
      };
    }

    case "RETRY_EXERCISE": {
      const { [action.exerciseId]: _removedResponse, ...restResponses } =
        state.responses;
      const { [action.exerciseId]: _removedResult, ...restResults } =
        state.results;
      const exerciseIndex = state.exercises.findIndex(
        (ex) => ex.id === action.exerciseId
      );

      return {
        ...state,
        responses: restResponses,
        results: restResults,
        currentIndex:
          exerciseIndex >= 0 ? exerciseIndex : state.currentIndex,
        status: "in_progress",
        completedAt: null,
      };
    }

    case "RETRY_ALL": {
      return {
        ...state,
        responses: {},
        results: {},
        currentIndex: 0,
        status: "in_progress",
        startedAt: new Date(),
        completedAt: null,
        attemptId: null,
      };
    }

    case "SET_ATTEMPT_ID": {
      return {
        ...state,
        attemptId: action.attemptId,
      };
    }

    default:
      return state;
  }
}

// ============================================================
// Hook
// ============================================================

export function usePracticePlayer(exercises: PracticeExercise[]) {
  const [state, dispatch] = useReducer(playerReducer, {
    exercises,
    currentIndex: 0,
    responses: {},
    results: {},
    status: "not_started",
    isGrading: false,
    startedAt: null,
    completedAt: null,
    attemptId: null,
  });

  // Derived values
  const currentExercise: PracticeExercise | null =
    state.exercises[state.currentIndex] ?? null;

  const isLastExercise = state.currentIndex === state.exercises.length - 1;
  const isFirstExercise = state.currentIndex === 0;

  const hasResult =
    currentExercise !== null && state.results[currentExercise.id] !== undefined;

  const gradedCount = Object.keys(state.results).length;

  const progress = useMemo(() => {
    if (state.exercises.length === 0) return 0;
    return Math.round((gradedCount / state.exercises.length) * 100);
  }, [gradedCount, state.exercises.length]);

  const totalCorrect = useMemo(() => {
    return Object.values(state.results).filter((r) => r.isCorrect).length;
  }, [state.results]);

  const totalScore = useMemo(() => {
    const results = Object.values(state.results);
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, r) => acc + r.score, 0);
    return Math.round(sum / results.length);
  }, [state.results]);

  // ============================================================
  // handleSubmit — the critical function
  // ============================================================

  const handleSubmit = useCallback(
    async (exerciseId: string, response: unknown) => {
      const exercise = state.exercises.find((e) => e.id === exerciseId);
      if (!exercise) return;

      const def = exercise.definition as ExerciseDefinition;
      const typedResponse = response as Record<string, unknown>;

      // Deterministic exercises: grade client-side (instant)
      if (
        ["multiple_choice", "fill_in_blank", "matching", "ordering"].includes(
          def.type
        )
      ) {
        let result: GradeResult;

        if (def.type === "multiple_choice") {
          result = gradeMultipleChoice(
            typedResponse.selectedOptionId as string,
            def
          );
        } else if (def.type === "fill_in_blank") {
          result = gradeFillInBlank(
            typedResponse.answers as string[],
            def
          );
        } else if (def.type === "matching") {
          result = gradeMatching(
            typedResponse.pairs as { leftId: string; rightId: string }[],
            def
          );
        } else if (def.type === "ordering") {
          result = gradeOrdering(
            typedResponse.orderedIds as string[],
            def
          );
        } else {
          // Should not reach here for deterministic types
          return;
        }

        dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
        return;
      }

      // AI-graded exercises: call server
      dispatch({ type: "SET_GRADING", isGrading: true });

      try {
        if (def.type === "free_text") {
          const res = await fetch("/api/practice/grade", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exerciseId,
              type: "free_text",
              studentResponse: typedResponse.text,
              definition: def,
            }),
          });
          if (!res.ok) throw new Error("Grading failed");

          const data = await res.json();
          const result: GradeResult = {
            isCorrect: data.isCorrect,
            score: data.score,
            feedback: data.feedback,
            explanation: def.explanation,
          };
          dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
        } else if (def.type === "audio_recording") {
          const formData = new FormData();
          formData.append("audio", typedResponse.audioBlob as Blob);
          formData.append("exerciseId", exerciseId);
          formData.append("type", "audio_recording");
          formData.append("targetPhrase", def.targetPhrase);
          formData.append("language", exercise.language);

          const res = await fetch("/api/practice/grade", {
            method: "POST",
            body: formData,
          });
          if (!res.ok) throw new Error("Audio grading failed");

          const data = await res.json();
          const result: GradeResult = {
            isCorrect: data.isCorrect,
            score: data.score,
            feedback: data.feedback,
            explanation: def.explanation,
            pronunciationDetails: data.pronunciationDetails,
          };
          dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
        } else if (def.type === "video_recording") {
          // Manual review required, but treat as completed for the player flow
          const result: GradeResult = {
            isCorrect: true, // Completed
            score: 100, // Placeholder score until graded
            feedback: "Video submitted successfully. Pending coach review.",
            explanation: def.explanation,
          };
          dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
        }
      } catch {
        // On error, create a failed result so user can retry
        const result: GradeResult = {
          isCorrect: false,
          score: 0,
          feedback: "Grading failed. Please retry.",
          explanation: undefined,
        };
        dispatch({ type: "SUBMIT_ANSWER", exerciseId, response, result });
      } finally {
        dispatch({ type: "SET_GRADING", isGrading: false });
      }
    },
    [state.exercises]
  );

  // ============================================================
  // Navigation & lifecycle callbacks
  // ============================================================

  const goNext = useCallback(() => {
    dispatch({ type: "NEXT_EXERCISE" });
  }, []);

  const goPrev = useCallback(() => {
    dispatch({ type: "PREV_EXERCISE" });
  }, []);

  const jumpTo = useCallback((index: number) => {
    dispatch({ type: "JUMP_TO", index });
  }, []);

  const complete = useCallback(() => {
    dispatch({ type: "COMPLETE", completedAt: new Date() });
  }, []);

  const retryExercise = useCallback((exerciseId: string) => {
    dispatch({ type: "RETRY_EXERCISE", exerciseId });
  }, []);

  const retryAll = useCallback(() => {
    dispatch({ type: "RETRY_ALL" });
  }, []);

  const start = useCallback(() => {
    dispatch({ type: "START" });
  }, []);

  const setAttemptId = useCallback((id: string) => {
    dispatch({ type: "SET_ATTEMPT_ID", attemptId: id });
  }, []);

  const loadAttempt = useCallback((attemptId: string, answers: Record<string, unknown>, results: Record<string, GradeResult>) => {
    dispatch({ type: "LOAD_ATTEMPT", attemptId, answers, results });
  }, []);

  return {
    state,
    currentExercise,
    isLastExercise,
    isFirstExercise,
    hasResult,
    progress,
    totalCorrect,
    totalScore,
    handleSubmit,
    goNext,
    goPrev,
    jumpTo,
    complete,
    retryExercise,
    retryAll,
    start,
    setAttemptId,
    loadAttempt,
  };
}
