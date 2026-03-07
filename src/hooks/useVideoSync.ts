"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { YouTubePlayer as YTPlayer } from "react-youtube";

interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
  sequence: number;
}

/**
 * Binary search for the active caption at a given time.
 * Captions must be sorted by startMs (ascending).
 * Returns the index of the caption where startMs <= currentMs < endMs,
 * or -1 if no caption covers the current time (gap or before first caption).
 * O(log n) -- critical for 200+ caption videos.
 */
export function findActiveCaptionIndex(
  captions: CaptionLine[],
  currentMs: number
): number {
  if (captions.length === 0) return -1;

  let low = 0;
  let high = captions.length - 1;
  let result = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (captions[mid].startMs <= currentMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Verify the found caption actually covers this time
  if (result >= 0 && currentMs < captions[result].endMs) {
    return result;
  }

  return -1; // In a gap between captions
}

/**
 * useVideoSync -- Polls YouTube player's getCurrentTime() at 250ms intervals,
 * finds the active caption via binary search, and provides seek functionality.
 *
 * Features:
 * - Loop mode: select a transcript range, video loops that section repeatedly
 * - Auto-pause: pauses after each caption line; student clicks to continue
 * - Both can be used simultaneously (auto-pause fires within a loop range)
 *
 * Performance: currentTime stored in ref (no re-renders per poll tick).
 * React state only updates when the active caption index changes (~0.2-1 re-renders/sec).
 *
 * IMPORTANT: handlePlayerReady receives event.target (raw YT.Player) from react-youtube,
 * where getCurrentTime() is synchronous. Do NOT use getInternalPlayer() which returns
 * a promisified wrapper.
 */
export function useVideoSync(captions: CaptionLine[]) {
  const playerRef = useRef<YTPlayer | null>(null);
  const currentTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);

  const [activeCaptionIndex, setActiveCaptionIndex] = useState(-1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [availableRates, setAvailableRates] = useState<number[]>([0.5, 0.75, 1, 1.25, 1.5, 2]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);

  // --- Loop range state ---
  const [loopRange, setLoopRangeState] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const loopRangeRef = useRef<{ startIndex: number; endIndex: number } | null>(null);
  const seekCooldownRef = useRef(0);

  // --- Auto-pause state ---
  const [autoPauseEnabled, setAutoPauseEnabledState] = useState(false);
  const autoPauseEnabledRef = useRef(false);
  const [isAutoPaused, setIsAutoPaused] = useState(false);
  const isAutoPausedRef = useRef(false);
  const lastAutoPausedRef = useRef(-1);
  const activeCaptionIndexRef = useRef(-1);

  // Sync refs with state for access inside polling callback (avoids stale closures)
  const setLoopRange = useCallback((range: { startIndex: number; endIndex: number } | null) => {
    loopRangeRef.current = range;
    setLoopRangeState(range);
    lastAutoPausedRef.current = -1; // Reset auto-pause tracking on loop change
  }, []);

  const setAutoPauseEnabled = useCallback((enabled: boolean) => {
    autoPauseEnabledRef.current = enabled;
    setAutoPauseEnabledState(enabled);
    if (!enabled) {
      setIsAutoPaused(false);
      isAutoPausedRef.current = false;
      lastAutoPausedRef.current = -1;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current) return; // Already polling

    intervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      // 1. Get currentMs from player
      const timeS = player.getCurrentTime() as unknown as number;
      const timeMs = Math.round(timeS * 1000);
      currentTimeRef.current = timeMs;

      // 2. Loop boundary check (seekTo if past end)
      const currentLoopRange = loopRangeRef.current;
      if (currentLoopRange && isPlayingRef.current && seekCooldownRef.current <= 0) {
        const endMs = captions[currentLoopRange.endIndex]?.endMs;
        const startMs = captions[currentLoopRange.startIndex]?.startMs;
        if (endMs !== undefined && startMs !== undefined && timeMs >= endMs) {
          player.seekTo(startMs / 1000, true);
          seekCooldownRef.current = 3; // Skip next 3 poll ticks (750ms)
          return; // Skip further processing this tick
        }
      }

      // 3. Seek cooldown decrement
      if (seekCooldownRef.current > 0) seekCooldownRef.current--;

      // 4. Compute newIndex via binary search
      const newIndex = findActiveCaptionIndex(captions, timeMs);

      // 5. Auto-pause boundary check (pause if caption transition)
      if (autoPauseEnabledRef.current && isPlayingRef.current) {
        const prevIndex = activeCaptionIndexRef.current;
        // Caption transition: we were on a valid caption, now moved to a different index
        if (prevIndex >= 0 && prevIndex !== newIndex && prevIndex !== lastAutoPausedRef.current) {
          isAutoPausedRef.current = true;
          setIsAutoPaused(true);
          lastAutoPausedRef.current = prevIndex;
          player.pauseVideo();
          // Don't stop polling -- let student click to resume
        }
      }

      // 6. Update activeCaptionIndexRef
      activeCaptionIndexRef.current = newIndex;

      // 7. Update activeCaptionIndex state (only when changed)
      setActiveCaptionIndex((prev) => (prev === newIndex ? prev : newIndex));

      // 8. Update currentTimeMs state (throttled to 200ms delta)
      setCurrentTimeMs((prev) => (Math.abs(prev - timeMs) > 200 ? timeMs : prev));
    }, 250);
  }, [captions]);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  // Player event handlers
  const handlePlayerReady = useCallback((player: YTPlayer) => {
    playerRef.current = player;
    try {
      const rates = player.getAvailablePlaybackRates() as unknown as number[];
      if (rates && rates.length > 0) {
        setAvailableRates(rates);
      }
    } catch {
      // Keep default rates if API call fails
    }
  }, []);

  // Playback rate control
  const setPlaybackRate = useCallback((rate: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.setPlaybackRate(rate);
    setPlaybackRateState(rate);
  }, []);

  // Pause/play controls for external use (e.g., TTS coordination)
  const pauseVideo = useCallback(() => {
    playerRef.current?.pauseVideo();
  }, []);

  const playVideo = useCallback(() => {
    playerRef.current?.playVideo();
  }, []);

  const handlePlay = useCallback(() => {
    isPlayingRef.current = true;
    startPolling();
  }, [startPolling]);

  const handlePause = useCallback(() => {
    isPlayingRef.current = false;
    // When auto-paused, keep polling alive so the student can resume
    // and the UI stays responsive. Only stop polling on genuine user pause.
    if (!isAutoPausedRef.current) {
      stopPolling();
    }
  }, [stopPolling]);

  const handleEnd = useCallback(() => {
    isPlayingRef.current = false;
    stopPolling();
    setActiveCaptionIndex(-1);
  }, [stopPolling]);

  // Resume from auto-pause
  const resumeFromAutoPause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    isAutoPausedRef.current = false;
    setIsAutoPaused(false);
    player.playVideo();
  }, []);

  // Seek to a caption's start time
  const seekToCaption = useCallback(
    (index: number) => {
      const player = playerRef.current;
      if (!player || index < 0 || index >= captions.length) return;

      const seconds = captions[index].startMs / 1000;
      player.seekTo(seconds, true);
      // Immediate index update for instant UI feedback (don't wait for next poll tick)
      setActiveCaptionIndex(index);
      activeCaptionIndexRef.current = index;

      // Reset auto-pause tracking so it can fire on the new position
      lastAutoPausedRef.current = -1;

      // Clear auto-pause state if currently paused
      if (isAutoPausedRef.current) {
        isAutoPausedRef.current = false;
        setIsAutoPaused(false);
      }

      // Auto-play if video was paused
      if (!isPlayingRef.current) {
        player.playVideo();
      }
    },
    [captions]
  );

  return {
    activeCaptionIndex,
    handlePlayerReady,
    handlePlay,
    handlePause,
    handleEnd,
    seekToCaption,
    playbackRate,
    setPlaybackRate,
    availableRates,
    currentTimeMs,
    pauseVideo,
    playVideo,
    // Loop range
    loopRange,
    setLoopRange,
    // Auto-pause
    autoPauseEnabled,
    setAutoPauseEnabled,
    isAutoPaused,
    resumeFromAutoPause,
  };
}
