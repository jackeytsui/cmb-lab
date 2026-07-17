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
 * Persistence is layered so no exit path loses progress:
 * - Debounced saves while watching, with maxWait so a save lands at least
 *   every 10s even during uninterrupted playback (a plain debounce would keep
 *   deferring and never fire until playback stopped).
 * - flush() + sendBeacon on tab hide (closing/switching the tab).
 * - sendBeacon on unmount, which is how in-app navigation ("Back to Course")
 *   leaves the page — visibilitychange never fires in that case.
 *
 * Positions within END_THRESHOLD_SECONDS of the end are saved as 0 so a
 * finished video restarts next time.
 */
export function useLessonResume({
  lessonId,
  currentTime,
  duration,
}: UseLessonResumeOpts) {
  // Keep latest values in refs for the hide/unmount handlers (avoids stale
  // closures on the once-registered listener). Updated in an effect so we
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

  // Debounced save — coalesces rapid timeupdate calls, but maxWait guarantees a
  // save at least every 10s during continuous playback.
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
    5_000,
    { leading: false, trailing: true, maxWait: 10_000 }
  );

  // Trigger a debounced save as playback position advances. Not gated on a
  // "playing" flag so that pausing mid-video and leaving still persists the
  // spot; the currentTime > 0 guard avoids saving the initial load at 0.
  useEffect(() => {
    if (lessonId && currentTime > 0 && duration > 0) {
      savePosition(currentTime, duration);
    }
  }, [currentTime, lessonId, duration, savePosition]);

  // Reliable last-chance save via beacon on tab hide and on unmount.
  useEffect(() => {
    function saveViaBeacon() {
      const id = lessonIdRef.current;
      const pos = currentTimeRef.current;
      const dur = durationRef.current;
      if (!id || pos <= 0) return;

      const payload = JSON.stringify({
        lastPositionSeconds: positionToSave(pos, dur),
      });
      navigator.sendBeacon(
        `/api/progress/${id}/position`,
        new Blob([payload], { type: "application/json" })
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        savePosition.flush();
        saveViaBeacon();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // In-app navigation away from the lesson unmounts this component while the
      // page is still visible, so visibilitychange never fires — persist here.
      saveViaBeacon();
      savePosition.cancel();
    };
  }, [savePosition, positionToSave]);
}
