---
phase: "02"
plan: "01"
subsystem: "video"
tags: [xstate, mux-player, state-machine, cue-points, interactive-video]
dependencies:
  requires: ["01-foundation"]
  provides: ["video-state-machine", "cue-point-detection", "interactive-player-component"]
  affects: ["02-02-overlay", "02-03-subtitles"]
tech-stack:
  added: [xstate@5.25.1, "@xstate/react@6.0.0", framer-motion@12.29.2]
  patterns: [state-machine, refs, forwardRef]
key-files:
  created:
    - src/types/video.ts
    - src/machines/videoPlayerMachine.ts
    - src/hooks/useInteractiveVideo.ts
    - src/components/video/InteractiveVideoPlayer.tsx
  modified:
    - package.json
    - package-lock.json
decisions:
  - id: xstate-v5
    choice: "XState v5 createMachine over useReducer"
    rationale: "State machines prevent impossible states (e.g., playing while interaction overlay visible)"
  - id: fade-duration
    choice: "500ms volume fade before cue point pause"
    rationale: "Smooth audio transition per user decision (0.5-1s range)"
  - id: mux-native-cuepoints
    choice: "Use Mux addCuePoints() API instead of polling timeupdate"
    rationale: "More accurate, native API, less CPU usage"
metrics:
  duration: "6 min"
  completed: "2026-01-26"
---

# Phase 02 Plan 01: Video State Machine and Cue Point Detection

XState v5 state machine with Mux Player integration for pause-and-respond interactive video functionality.

## One-liner

XState v5 state machine (idle/playing/paused/pausedForInteraction) with Mux native cue point detection and 500ms volume fade.

## What Was Built

### State Machine (src/machines/videoPlayerMachine.ts)

- **4 states**: idle, playing, paused, pausedForInteraction
- **Guard**: `cuePointNotCompleted` prevents re-triggering completed interactions
- **Actions**: updateTime, setActiveCuePoint, clearActiveCuePoint, saveVolume, restoreVolume
- **Key constraint**: pausedForInteraction can ONLY transition to playing via INTERACTION_COMPLETE

### React Hook (src/hooks/useInteractiveVideo.ts)

- Wraps XState machine with `useMachine` from @xstate/react
- Manages Mux Player ref for programmatic control
- Volume fade utility: 20 steps over 500ms for smooth audio cutoff
- Returns clean API: `play()`, `pause()`, `completeInteraction()`, `handleCuePointReached()`

### Component (src/components/video/InteractiveVideoPlayer.tsx)

- Integrates Mux Player with XState via the hook
- Cue point detection via `addCuePoints()` and `cuepointchange` event
- Visual cue point markers on progress bar (green=completed, yellow=pending)
- Exposes `completeInteraction` via forwardRef for overlay to call
- "Interaction Required" badge when paused for interaction

### Types (src/types/video.ts)

- `CuePoint`: id, timestamp, interactionId, completed
- `SubtitleCue`: startTime, endTime, chinese, pinyin?, jyutping?
- `VideoState`: "idle" | "playing" | "paused" | "pausedForInteraction"
- `VideoContext` and `VideoEvent` for XState typing

## Key Patterns Used

1. **XState v5 createMachine** - Not v4 Machine() function
2. **Mux native cue points** - addCuePoints() + cuepointchange event
3. **Volume fade** - Gradual 20-step fade over 500ms before pause
4. **forwardRef** - Expose completeInteraction to parent components

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| package.json | Added xstate, @xstate/react, framer-motion | +5 |
| src/types/video.ts | Created | 83 |
| src/machines/videoPlayerMachine.ts | Created | 184 |
| src/hooks/useInteractiveVideo.ts | Created | 230 |
| src/components/video/InteractiveVideoPlayer.tsx | Created | 280 |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| State management | XState v5 | Prevents impossible states, visualizable, typed |
| Cue point detection | Mux native API | More accurate than polling timeupdate |
| Volume fade duration | 500ms | Within 0.5-1s range from user decision |
| Marker colors | Green/Yellow | Clear completed vs pending distinction |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

```
Dependencies: xstate@5.25.1, @xstate/react@6.0.0, framer-motion@12.29.2
TypeScript: Compiles without errors
Files: All 4 files created successfully
v4 patterns: None found (uses createMachine, useMachine)
```

## Next Phase Readiness

**Ready for 02-02**: Overlay composition with Framer Motion AnimatePresence

The InteractiveVideoPlayer component:
- Calls `onInteractionRequired(cuePoint)` when pausing for interaction
- Exposes `completeInteraction()` via ref for overlay to call after grading
- Provides `isInteractionPending` state for overlay visibility logic

**Integration point for overlay:**
```tsx
const playerRef = useRef<InteractiveVideoPlayerRef>(null);

<InteractiveVideoPlayer
  ref={playerRef}
  onInteractionRequired={(cp) => setActiveInteraction(cp)}
/>

// In overlay, after grading:
playerRef.current?.completeInteraction();
```
