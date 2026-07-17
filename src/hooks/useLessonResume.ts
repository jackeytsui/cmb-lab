"use client";

import { useEffect, useRef, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

interface UseLessonResumeOpts {
  /** Lesson ID to save position for. If undefined, saving is disabled. */
  lessonId?: string;
  /** Current playback position in seconds */
  currentTime: number;
  /** Video duration in seconds (0/undefined until known) */
  duration: number;
  /** Whether the video is currently playing */
  isPlaying: boolean;
}

/**
 * How close to the end (in seconds) counts as "finished". When the student
 * stops within this window we save position 0 so the next visit starts the
 * video over instead of dropping them onto the final frame.
 */
const END_THRESHOLD_SECONDS = 15;

/**
 * useLessonResume — periodically saves the student's playback position for a
 * lesson video so it can resume where they left off.
 *
 * Mirrors useWatchProgress (used for the listening library) but targets the
 * lesson progress endpoint:
 * - Debounces saves to at most once every 10 seconds while playing.
 * - Flushes + sendBeacon on tab hide so progress survives closing the tab.
 * - Saves position 0 near the end so a finished video restarts next time.
 */
export function useLessonResume({
  lessonId,
  currentTime,
  duration,
  isPlaying,
}: UseLessonResumeOpts) {
  // Keep latest values in refs for the visibilitychange handler (avoids stale
  // closures on the one-time-registered listener). Updated in an effect so we
  // never touch refs during render.
  const currentTimeRef = useRef(currentTime);
  const durationRef = useRef(duration);
  const lessonIdRef = useRef(lessonId);
  useEffect(() => {
    currentTimeRef.current = currentTime;
    durationRef.current = duration;
    lessonIdRef.current = lessonId;
  });

  /** Normalize a raw position into the value we want to persist. */
  const positionToSave = useCallback(
    (posSeconds: number, durSeconds: number): number => {
      if (durSeconds > 0 && posSeconds >= durSeconds - END_THRESHOLD_SECONDS) {
        // Treat "watched to the end" as start-over.
        return 0;
      }
      return Math.max(0, Math.floor(posSeconds));
    },
    []
  );

  // Debounced save — fires at most every 10 seconds.
  const savePosition = useDebouncedCallback(
    (posSeconds: number, durSeconds: number) => {
      const id = lessonIdRef.current;
      if (!id) return;

      fetch(`/api/progress/${id}/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lastPositionSeconds: positionToSave(posSeconds, durSeconds),
        }),
        keepalive: true,
      }).catch((err) => {
        console.error("Failed to save lesson position:", err);
      });
    },
    10_000,
    { leading: false, trailing: true }
  );

  // Trigger a debounced save as playback advances.
  useEffect(() => {
    if (lessonId && isPlaying && currentTime > 0 && duration > 0) {
      savePosition(currentTime, duration);
    }
  }, [currentTime, isPlaying, lessonId, duration, savePosition]);

  // Flush + beacon on tab hide so we don't lose the last few seconds.
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "hidden") return;

      savePosition.flush();

      const id = lessonIdRef.current;
      const dur = durationRef.current;
      const pos = currentTimeRef.current;
      if (!id || pos <= 0) return;

      const payload = JSON.stringify({
        lastPositionSeconds: positionToSave(pos, dur),
      });
      navigator.sendBeacon(
        `/api/progress/${id}/position`,
        new Blob([payload], { type: "application/json" })
      );
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      savePosition.cancel();
    };
  }, [savePosition, positionToSave]);
}
