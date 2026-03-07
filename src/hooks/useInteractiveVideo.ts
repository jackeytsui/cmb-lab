"use client";

/**
 * useInteractiveVideo Hook
 *
 * React hook that wraps the XState video player machine with Mux Player integration.
 * Provides a clean API for controlling the interactive video player.
 */

import { useRef, useCallback, useMemo } from "react";
import { useMachine } from "@xstate/react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { videoPlayerMachine } from "@/machines/videoPlayerMachine";
import type { CuePoint, VideoState } from "@/types/video";

/**
 * Configuration options for the hook.
 */
export interface UseInteractiveVideoOptions {
  /** Initial cue points to register */
  cuePoints?: CuePoint[];
  /** Volume fade duration in milliseconds (default: 500) */
  fadeDuration?: number;
}

/**
 * Return type for the useInteractiveVideo hook.
 */
export interface UseInteractiveVideoReturn {
  /** Current state value ("idle" | "playing" | "paused" | "pausedForInteraction") */
  state: VideoState;
  /** Full machine context */
  context: {
    currentTime: number;
    duration: number;
    volume: number;
    cuePoints: CuePoint[];
    activeCuePoint: CuePoint | null;
    savedVolume: number;
  };
  /** Ref to attach to MuxPlayer component */
  playerRef: React.RefObject<MuxPlayerRefAttributes | null>;
  /** Start or resume playback */
  play: () => void;
  /** Pause playback (user-initiated) */
  pause: () => void;
  /** Update current time (call from timeupdate event) */
  updateTime: (time: number) => void;
  /** Set video duration (call from durationchange event) */
  setDuration: (duration: number) => void;
  /** Handle cue point reached - fades volume and pauses */
  handleCuePointReached: (cuePoint: CuePoint) => Promise<void>;
  /** Complete interaction and resume playback */
  completeInteraction: () => void;
  /** Whether video is paused for interaction */
  isInteractionPending: boolean;
  /** Update cue points list */
  setCuePoints: (cuePoints: CuePoint[]) => void;
}

/**
 * Utility to fade volume over a duration.
 * Gradually fades from startVolume to 0 over the specified duration.
 */
function fadeVolume(
  player: MuxPlayerRefAttributes,
  startVolume: number,
  duration: number
): Promise<void> {
  return new Promise((resolve) => {
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      const newVolume = Math.max(0, startVolume - volumeStep * currentStep);
      player.volume = newVolume;

      if (currentStep >= steps) {
        clearInterval(interval);
        player.volume = 0;
        resolve();
      }
    }, stepDuration);
  });
}

/**
 * Hook for managing interactive video playback with XState.
 *
 * @param options - Configuration options
 * @returns Controls and state for the interactive video player
 *
 * @example
 * ```tsx
 * const {
 *   state,
 *   playerRef,
 *   play,
 *   pause,
 *   handleCuePointReached,
 *   completeInteraction,
 *   isInteractionPending,
 * } = useInteractiveVideo({ cuePoints });
 * ```
 */
export function useInteractiveVideo(
  options: UseInteractiveVideoOptions = {}
): UseInteractiveVideoReturn {
  const { cuePoints: initialCuePoints = [], fadeDuration = 500 } = options;

  const playerRef = useRef<MuxPlayerRefAttributes | null>(null);

  const [snapshot, send] = useMachine(videoPlayerMachine, {
    input: {
      cuePoints: initialCuePoints,
    },
  });

  // Extract state value as VideoState type
  const state = snapshot.value as VideoState;
  const context = snapshot.context;

  // Memoize derived state
  const isInteractionPending = useMemo(
    () => state === "pausedForInteraction",
    [state]
  );

  /**
   * Start or resume video playback.
   */
  const play = useCallback(() => {
    send({ type: "PLAY" });
    playerRef.current?.play();
  }, [send]);

  /**
   * Pause video (user-initiated).
   */
  const pause = useCallback(() => {
    send({ type: "PAUSE" });
    playerRef.current?.pause();
  }, [send]);

  /**
   * Update current time from timeupdate event.
   */
  const updateTime = useCallback(
    (time: number) => {
      send({ type: "TIME_UPDATE", time });
    },
    [send]
  );

  /**
   * Set video duration from durationchange event.
   */
  const setDuration = useCallback(
    (duration: number) => {
      send({ type: "SET_DURATION", duration });
    },
    [send]
  );

  /**
   * Update cue points list.
   */
  const setCuePoints = useCallback(
    (cuePoints: CuePoint[]) => {
      send({ type: "SET_CUE_POINTS", cuePoints });
    },
    [send]
  );

  /**
   * Handle when a cue point is reached.
   * Fades volume, pauses the player, and triggers the state transition.
   */
  const handleCuePointReached = useCallback(
    async (cuePoint: CuePoint) => {
      const player = playerRef.current;
      if (!player) return;

      // Skip if already completed
      if (cuePoint.completed) return;

      // Skip if already paused for interaction
      if (state === "pausedForInteraction") return;

      // Get current volume for fade
      const currentVolume = player.volume;

      // Fade volume out smoothly
      await fadeVolume(player, currentVolume, fadeDuration);

      // Pause the player
      player.pause();

      // Send event to machine
      send({ type: "CUE_POINT_REACHED", cuePoint });
    },
    [send, fadeDuration, state]
  );

  /**
   * Complete the current interaction and resume playback.
   */
  const completeInteraction = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;

    // Only proceed if we're actually paused for interaction
    if (state !== "pausedForInteraction") return;

    // Send completion event (this will restore volume via the machine action)
    send({ type: "INTERACTION_COMPLETE" });

    // Restore volume from saved value
    player.volume = context.savedVolume;

    // Resume playback
    player.play();
  }, [send, state, context.savedVolume]);

  return {
    state,
    context,
    playerRef,
    play,
    pause,
    updateTime,
    setDuration,
    handleCuePointReached,
    completeInteraction,
    isInteractionPending,
    setCuePoints,
  };
}
