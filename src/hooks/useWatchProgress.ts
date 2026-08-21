"use client";

import { useEffect, useRef, useCallback } from "react";
import { useDebouncedCallback } from "use-debounce";

interface UseWatchProgressOpts {
  sessionId: string | null;
  currentTimeMs: number;
  videoDurationMs: number | null;
  isPlaying: boolean;
  videoTitle?: string | null;
}

/**
 * useWatchProgress -- Periodically saves video watch progress to the server.
 *
 * Features:
 * - Debounces progress saves to every 10 seconds (at most)
 * - Fires sendBeacon on visibilitychange (hidden) to preserve progress on tab close
 * - Sends video title only once (first save)
 * - Uses a ref for currentTimeMs to avoid stale closures in the visibilitychange handler
 */
export function useWatchProgress({
  sessionId,
  currentTimeMs,
  videoDurationMs,
  isPlaying,
  videoTitle,
}: UseWatchProgressOpts) {
  // Ref to keep currentTimeMs fresh for visibilitychange handler (avoids stale closure)
  const currentTimeRef = useRef(currentTimeMs);

  // Ref to keep videoDurationMs fresh
  const durationRef = useRef(videoDurationMs);

  // Ref to keep sessionId fresh
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    currentTimeRef.current = currentTimeMs;
    durationRef.current = videoDurationMs;
    sessionIdRef.current = sessionId;
  }, [currentTimeMs, sessionId, videoDurationMs]);

  // Track which session has received its title. A boolean can be corrupted by
  // a delayed save from the previous video after the user switches sessions.
  const titleSentSessionRef = useRef<string | null>(null);

  // Debounced save function -- fires at most every 10 seconds
  const saveProgress = useDebouncedCallback(
    (sid: string, positionMs: number, durationMs: number, title?: string | null) => {
      const payload: Record<string, unknown> = {
        sessionId: sid,
        lastPositionMs: positionMs,
        videoDurationMs: durationMs,
      };

      // Include title on first save only
      if (title && titleSentSessionRef.current !== sid) {
        payload.title = title;
        titleSentSessionRef.current = sid;
      }

      fetch("/api/video/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err) => {
        console.error("Failed to save progress:", err);
      });
    },
    10_000,
    { leading: false, trailing: true }
  );

  // Trigger debounced save when currentTimeMs changes and video is playing
  useEffect(() => {
    if (
      isPlaying &&
      sessionId &&
      currentTimeMs > 0 &&
      videoDurationMs !== null &&
      videoDurationMs > 0
    ) {
      saveProgress(sessionId, currentTimeMs, videoDurationMs, videoTitle);
    }
  }, [currentTimeMs, isPlaying, sessionId, videoDurationMs, videoTitle, saveProgress]);

  // Build sendBeacon payload helper
  const buildBeaconPayload = useCallback(() => {
    const sid = sessionIdRef.current;
    const dur = durationRef.current;
    const pos = currentTimeRef.current;
    if (!sid || !dur || dur <= 0) return null;

    return JSON.stringify({
      sessionId: sid,
      lastPositionMs: pos,
      videoDurationMs: dur,
    });
  }, []);

  // Page-leave handler: flush debounced save + sendBeacon as backup
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        // Attempt to flush any pending debounced save
        saveProgress.flush();

        // Send beacon as reliable backup for page-unload scenario
        const payload = buildBeaconPayload();
        if (payload) {
          navigator.sendBeacon(
            "/api/video/progress",
            new Blob([payload], { type: "application/json" })
          );
        }
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      // Client-side navigation may unmount without hiding the document.
      saveProgress.flush();
      saveProgress.cancel();
    };
  }, [saveProgress, buildBeaconPayload]);
}
