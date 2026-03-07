/**
 * Video Player State Machine
 *
 * XState v5 state machine for the interactive video player.
 * Models all video player states with guards to prevent impossible states.
 */

import { createMachine, assign } from "xstate";
import type { VideoContext, VideoEvent } from "@/types/video";

/**
 * Initial context for the video player machine.
 */
const initialContext: VideoContext = {
  currentTime: 0,
  duration: 0,
  volume: 1,
  cuePoints: [],
  activeCuePoint: null,
  savedVolume: 1,
};

/**
 * Video player state machine.
 *
 * States:
 * - idle: Initial state, video not started
 * - playing: Video is actively playing
 * - paused: User paused the video (can resume with PLAY)
 * - pausedForInteraction: System paused for interaction (can ONLY resume with INTERACTION_COMPLETE)
 *
 * Guards prevent transitioning to pausedForInteraction if the cue point is already completed.
 */
export const videoPlayerMachine = createMachine(
  {
    id: "videoPlayer",
    initial: "idle",
    context: initialContext,
    types: {} as {
      context: VideoContext;
      events: VideoEvent;
    },
    states: {
      idle: {
        on: {
          PLAY: { target: "playing" },
          TIME_UPDATE: {
            target: "playing",
            actions: "updateTime",
          },
          CUE_POINT_REACHED: {
            target: "pausedForInteraction",
            guard: "cuePointNotCompleted",
            actions: ["saveVolume", "setActiveCuePoint"],
          },
          SET_DURATION: {
            actions: "setDuration",
          },
          SET_CUE_POINTS: {
            actions: "setCuePoints",
          },
        },
      },
      playing: {
        on: {
          PAUSE: { target: "paused" },
          TIME_UPDATE: {
            actions: "updateTime",
          },
          CUE_POINT_REACHED: {
            target: "pausedForInteraction",
            guard: "cuePointNotCompleted",
            actions: ["saveVolume", "setActiveCuePoint"],
          },
          SET_VOLUME: {
            actions: "setVolume",
          },
          SEEK: {
            actions: "updateTime",
          },
          SET_DURATION: {
            actions: "setDuration",
          },
          SET_CUE_POINTS: {
            actions: "setCuePoints",
          },
        },
      },
      paused: {
        on: {
          PLAY: { target: "playing" },
          TIME_UPDATE: {
            actions: "updateTime",
          },
          SEEK: {
            actions: "updateTime",
          },
          SET_VOLUME: {
            actions: "setVolume",
          },
          SET_DURATION: {
            actions: "setDuration",
          },
          SET_CUE_POINTS: {
            actions: "setCuePoints",
          },
        },
      },
      pausedForInteraction: {
        // Video is paused for interaction - overlay should be visible
        // CANNOT resume until interaction is complete
        on: {
          INTERACTION_COMPLETE: {
            target: "playing",
            actions: ["clearActiveCuePoint", "restoreVolume"],
          },
          SET_VOLUME: {
            actions: "setVolume",
          },
          SET_DURATION: {
            actions: "setDuration",
          },
          SET_CUE_POINTS: {
            actions: "setCuePoints",
          },
        },
      },
    },
  },
  {
    actions: {
      updateTime: assign({
        currentTime: ({ event }) => {
          if (event.type === "TIME_UPDATE" || event.type === "SEEK") {
            return event.time;
          }
          return 0;
        },
      }),
      setActiveCuePoint: assign({
        activeCuePoint: ({ event }) => {
          if (event.type === "CUE_POINT_REACHED") {
            return event.cuePoint;
          }
          return null;
        },
      }),
      clearActiveCuePoint: assign({
        activeCuePoint: () => null,
      }),
      saveVolume: assign({
        savedVolume: ({ context }) => context.volume,
      }),
      restoreVolume: assign({
        volume: ({ context }) => context.savedVolume,
      }),
      setVolume: assign({
        volume: ({ event }) => {
          if (event.type === "SET_VOLUME") {
            return event.volume;
          }
          return 1;
        },
      }),
      setDuration: assign({
        duration: ({ event }) => {
          if (event.type === "SET_DURATION") {
            return event.duration;
          }
          return 0;
        },
      }),
      setCuePoints: assign({
        cuePoints: ({ event }) => {
          if (event.type === "SET_CUE_POINTS") {
            return event.cuePoints;
          }
          return [];
        },
      }),
    },
    guards: {
      cuePointNotCompleted: ({ event }) => {
        if (event.type === "CUE_POINT_REACHED") {
          return event.cuePoint.completed !== true;
        }
        return false;
      },
    },
  }
);

export type VideoPlayerMachine = typeof videoPlayerMachine;
