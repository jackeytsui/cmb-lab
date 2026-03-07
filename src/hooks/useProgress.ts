"use client";

import { useState, useCallback, useEffect } from "react";
import type { CompletionStatus } from "@/lib/progress";

interface ProgressState {
  /** Current video watch percentage (0-100) */
  videoWatchedPercent: number;
  /** Completion status with detailed breakdown */
  completion: CompletionStatus | null;
  /** Whether initial progress is being loaded */
  isLoading: boolean;
  /** Error message if fetch/update failed */
  error: string | null;
}

interface UseProgressOptions {
  /** Lesson ID to track progress for. If undefined, hook returns no-op functions. */
  lessonId?: string;
}

interface UseProgressReturn extends ProgressState {
  /**
   * Update video watch percentage.
   * Progress is monotonic - only increases are saved.
   * @param percent - Current watch percentage (0-100)
   * @returns true if this update completed the lesson
   */
  updateVideoProgress: (percent: number) => Promise<boolean>;
  /**
   * Mark an interaction as completed (passed).
   * @returns true if this update completed the lesson
   */
  markInteractionComplete: () => Promise<boolean>;
}

/**
 * Client-side hook for tracking lesson progress.
 *
 * Features:
 * - Fetches initial progress on mount
 * - Updates video watch percentage with monotonic progress
 * - Marks interactions as completed
 * - Returns completion status for UI feedback
 *
 * @example
 * ```tsx
 * const { videoWatchedPercent, completion, updateVideoProgress } = useProgress({
 *   lessonId: "abc123",
 * });
 *
 * // In video player time update handler:
 * const handleTimeUpdate = async (currentTime: number, duration: number) => {
 *   const percent = Math.floor((currentTime / duration) * 100);
 *   const justCompleted = await updateVideoProgress(percent);
 *   if (justCompleted) {
 *     // Show completion celebration
 *   }
 * };
 * ```
 */
export function useProgress({ lessonId }: UseProgressOptions): UseProgressReturn {
  const [state, setState] = useState<ProgressState>({
    videoWatchedPercent: 0,
    completion: null,
    isLoading: !!lessonId, // Only loading if we have a lessonId
    error: null,
  });

  // No-op functions for when lessonId is undefined
  const noOpUpdateVideoProgress = useCallback(
    async (): Promise<boolean> => false,
    []
  );
  const noOpMarkInteractionComplete = useCallback(
    async (): Promise<boolean> => false,
    []
  );

  // Fetch initial progress on mount (only if lessonId is defined)
  useEffect(() => {
    if (!lessonId) return; // Skip fetch if no lessonId

    async function fetchProgress() {
      try {
        const res = await fetch(`/api/progress/${lessonId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch progress");
        }
        const data = await res.json();
        setState({
          videoWatchedPercent: data.progress?.videoWatchedPercent ?? 0,
          completion: data.completion,
          isLoading: false,
          error: null,
        });
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        }));
      }
    }
    fetchProgress();
  }, [lessonId]);

  // Dispatch PWA install prompt event on first-ever lesson completion
  const dispatchFirstLessonComplete = useCallback(() => {
    if (typeof window === "undefined") return;
    const hasCompletedBefore = localStorage.getItem("pwa-has-completed-lesson");
    if (!hasCompletedBefore) {
      localStorage.setItem("pwa-has-completed-lesson", "true");
      window.dispatchEvent(new CustomEvent("pwa-first-lesson-complete"));
    }
  }, []);

  // Update video watch percentage (guarded by lessonId check)
  const updateVideoProgress = useCallback(
    async (percent: number): Promise<boolean> => {
      if (!lessonId) return false; // No-op if no lessonId

      try {
        const res = await fetch(`/api/progress/${lessonId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoWatchedPercent: percent }),
        });
        if (!res.ok) {
          throw new Error("Failed to update progress");
        }
        const data = await res.json();
        setState((prev) => ({
          ...prev,
          videoWatchedPercent:
            data.progress?.videoWatchedPercent ?? prev.videoWatchedPercent,
          completion: data.completion,
        }));
        const completed = data.lessonComplete ?? false;
        if (completed) {
          dispatchFirstLessonComplete();
        }
        return completed;
      } catch (err) {
        console.error("Progress update failed:", err);
        return false;
      }
    },
    [lessonId, dispatchFirstLessonComplete]
  );

  // Mark interaction as completed (guarded by lessonId check)
  const markInteractionComplete = useCallback(async (): Promise<boolean> => {
    if (!lessonId) return false; // No-op if no lessonId

    try {
      const res = await fetch(`/api/progress/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionCompleted: true }),
      });
      if (!res.ok) {
        throw new Error("Failed to mark interaction");
      }
      const data = await res.json();
      setState((prev) => ({
        ...prev,
        completion: data.completion,
      }));
      const completed = data.lessonComplete ?? false;
      if (completed) {
        dispatchFirstLessonComplete();
      }
      return completed;
    } catch (err) {
      console.error("Interaction complete failed:", err);
      return false;
    }
  }, [lessonId, dispatchFirstLessonComplete]);

  // If no lessonId, return no-op functions (hook must still be called unconditionally)
  if (!lessonId) {
    return {
      ...state,
      updateVideoProgress: noOpUpdateVideoProgress,
      markInteractionComplete: noOpMarkInteractionComplete,
    };
  }

  return {
    ...state,
    updateVideoProgress,
    markInteractionComplete,
  };
}
