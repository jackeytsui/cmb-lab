"use client";

import { useReducer, useEffect, useMemo } from "react";
import { nanoid } from "nanoid";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Types
// ============================================================

export interface BuilderExercise {
  id: string; // Server UUID or 'temp-<nanoid>' for new exercises
  type: string; // ExerciseType string
  language: "cantonese" | "mandarin" | "both";
  definition: ExerciseDefinition;
  sortOrder: number;
  practiceSetId: string;
  isNew: boolean; // true for palette-added exercises, false for server-loaded
  isConfigured: boolean; // false when just dragged from palette with skeleton definition
}

export interface BuilderState {
  exercises: BuilderExercise[];
  title: string;
  description: string;
  status: "draft" | "published" | "archived";
}

interface HistoryState {
  past: BuilderState[];
  present: BuilderState;
  future: BuilderState[];
}

export type BuilderAction =
  | {
      type: "ADD_EXERCISE";
      exerciseType: string;
      language: "cantonese" | "mandarin" | "both";
      atIndex?: number;
    }
  | { type: "REMOVE_EXERCISE"; exerciseId: string }
  | { type: "REORDER_EXERCISES"; fromIndex: number; toIndex: number }
  | {
      type: "UPDATE_EXERCISE";
      exerciseId: string;
      data: Partial<BuilderExercise>;
    }
  | { type: "UPDATE_SET_META"; title?: string; description?: string }
  | { type: "SET_STATUS"; status: "draft" | "published" | "archived" }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "MARK_SAVED"; idMap: Map<string, string> };

// ============================================================
// Skeleton Definitions per Exercise Type
// ============================================================

function createSkeletonDefinition(
  exerciseType: string
): ExerciseDefinition {
  switch (exerciseType) {
    case "multiple_choice":
      return {
        type: "multiple_choice",
        question: "",
        options: [
          { id: nanoid(), text: "" },
          { id: nanoid(), text: "" },
        ],
        correctOptionId: "",
      };
    case "fill_in_blank":
      return {
        type: "fill_in_blank",
        sentence: "",
        blanks: [{ id: nanoid(), correctAnswer: "" }],
      };
    case "matching":
      return {
        type: "matching",
        pairs: [
          { id: nanoid(), left: "", right: "" },
          { id: nanoid(), left: "", right: "" },
        ],
      };
    case "ordering":
      return {
        type: "ordering",
        items: [
          { id: nanoid(), text: "", correctPosition: 0 },
          { id: nanoid(), text: "", correctPosition: 1 },
        ],
      };
    case "audio_recording":
      return {
        type: "audio_recording",
        targetPhrase: "",
      };
    case "free_text":
      return {
        type: "free_text",
        prompt: "",
      };
    case "video_recording":
      return {
        type: "video_recording",
        prompt: "",
      };
    default:
      throw new Error(`Unknown exercise type: ${exerciseType}`);
  }
}

// ============================================================
// History-Aware Reducer
// ============================================================

const HISTORY_CAP = 50;

function applyAction(
  state: BuilderState,
  action: Exclude<
    BuilderAction,
    | { type: "UNDO" }
    | { type: "REDO" }
    | { type: "MARK_SAVED"; idMap: Map<string, string> }
  >
): BuilderState {
  switch (action.type) {
    case "ADD_EXERCISE": {
      const newExercise: BuilderExercise = {
        id: `temp-${nanoid()}`,
        type: action.exerciseType,
        language: action.language,
        definition: createSkeletonDefinition(action.exerciseType),
        sortOrder: 0, // Will be recalculated
        practiceSetId: "", // Set by the builder context
        isNew: true,
        isConfigured: false,
      };

      const exercises = [...state.exercises];
      if (action.atIndex !== undefined && action.atIndex >= 0) {
        exercises.splice(action.atIndex, 0, newExercise);
      } else {
        exercises.push(newExercise);
      }

      // Recalculate sortOrder
      return {
        ...state,
        exercises: exercises.map((ex, i) => ({ ...ex, sortOrder: i })),
      };
    }

    case "REMOVE_EXERCISE": {
      const exercises = state.exercises.filter(
        (ex) => ex.id !== action.exerciseId
      );
      return {
        ...state,
        exercises: exercises.map((ex, i) => ({ ...ex, sortOrder: i })),
      };
    }

    case "REORDER_EXERCISES": {
      const exercises = [...state.exercises];
      const [moved] = exercises.splice(action.fromIndex, 1);
      exercises.splice(action.toIndex, 0, moved);
      return {
        ...state,
        exercises: exercises.map((ex, i) => ({ ...ex, sortOrder: i })),
      };
    }

    case "UPDATE_EXERCISE": {
      return {
        ...state,
        exercises: state.exercises.map((ex) =>
          ex.id === action.exerciseId
            ? { ...ex, ...action.data, isConfigured: true }
            : ex
        ),
      };
    }

    case "UPDATE_SET_META": {
      return {
        ...state,
        ...(action.title !== undefined ? { title: action.title } : {}),
        ...(action.description !== undefined
          ? { description: action.description }
          : {}),
      };
    }

    case "SET_STATUS": {
      return {
        ...state,
        status: action.status,
      };
    }

    default:
      return state;
  }
}

function builderReducer(
  state: HistoryState,
  action: BuilderAction
): HistoryState {
  // UNDO: pop from past, push current to future
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }

  // REDO: pop from future, push current to past
  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    };
  }

  // MARK_SAVED: replace temp IDs with server IDs, set isNew: false
  // Does NOT push to history (sync action, not an edit)
  if (action.type === "MARK_SAVED") {
    const idMap = action.idMap;
    return {
      ...state,
      present: {
        ...state.present,
        exercises: state.present.exercises.map((ex) => {
          const serverId = idMap.get(ex.id);
          return {
            ...ex,
            id: serverId ?? ex.id,
            isNew: false,
          };
        }),
      },
    };
  }

  // All other actions: push structuredClone(present) to past, compute new present, clear future
  const clonedPresent = structuredClone(state.present);
  const newPast = [...state.past, clonedPresent];

  // Cap past at HISTORY_CAP entries (keep the most recent ones)
  const cappedPast =
    newPast.length > HISTORY_CAP
      ? newPast.slice(newPast.length - HISTORY_CAP)
      : newPast;

  const newPresent = applyAction(state.present, action);

  return {
    past: cappedPast,
    present: newPresent,
    future: [], // new action clears redo stack
  };
}

// ============================================================
// Hook
// ============================================================

export function useBuilderState(initialState: BuilderState) {
  const [historyState, dispatch] = useReducer(builderReducer, {
    past: [],
    present: initialState,
    future: [],
  });

  // Store the initial state snapshot to compute isDirty (computed once, never changes)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialSnapshot = useMemo(() => JSON.stringify(initialState), []);

  const canUndo = historyState.past.length > 0;
  const canRedo = historyState.future.length > 0;
  const isDirty = JSON.stringify(historyState.present) !== initialSnapshot;

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle when not typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Ctrl+Z / Cmd+Z (no Shift) = UNDO
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        !e.shiftKey
      ) {
        e.preventDefault();
        dispatch({ type: "UNDO" });
        return;
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z = REDO
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "z" &&
        e.shiftKey
      ) {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }

      // Ctrl+Y / Cmd+Y = REDO (Windows convention)
      if ((e.ctrlKey || e.metaKey) && e.key === "y" && !isInput) {
        e.preventDefault();
        dispatch({ type: "REDO" });
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return {
    state: historyState.present,
    dispatch,
    canUndo,
    canRedo,
    isDirty,
  };
}
