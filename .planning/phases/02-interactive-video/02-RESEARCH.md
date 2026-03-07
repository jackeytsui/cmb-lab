# Phase 2: Interactive Video - Research

**Researched:** 2026-01-26
**Domain:** Video State Machine, Cue Points, Overlay Composition, Subtitle Rendering with CJK Annotations
**Confidence:** HIGH

## Summary

Phase 2 transforms the basic Mux video player into an interactive learning experience. This research covers four core areas:

1. **Video State Machine**: Using XState to model video player states (playing, paused-for-interaction, etc.) with clean transitions and cue point handling. XState provides predictable state transitions that prevent impossible states like "playing while interaction overlay is visible."

2. **Mux Player Cue Points**: The Mux Player natively supports adding cue points via `addCuePoints()` and listening for `cuepointchange` events. Combined with programmatic `pause()` and `play()` controls, this enables the auto-pause-at-timestamp functionality.

3. **Overlay Composition with Framer Motion**: AnimatePresence handles smooth fade-in/fade-out transitions for the interaction overlay. The overlay uses a responsive sidebar pattern that collapses on mobile.

4. **Subtitle Rendering with Ruby Annotations**: Custom subtitle rendering using HTML `<ruby>` and `<rt>` elements for Pinyin/Jyutping annotations above Chinese characters. This requires hiding native Mux captions and rendering custom overlays synced to video time.

**Primary recommendation:** Use XState for state machine, Mux's native cue point API, Framer Motion for animations, and custom Ruby-annotated subtitles rendered as an overlay (not native VTT).

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@mux/mux-player-react` | ^3.10.x | Video player with cue points | Already in use, native cue point support, programmatic control |
| `xstate` | ^5.x | State machine for player states | Industry standard for finite state machines in React |
| `@xstate/react` | ^4.x | XState React bindings | Official hooks for using XState machines in React |
| `framer-motion` | ^11.x | Animation library | De facto React animation standard, AnimatePresence for exit animations |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `next/font/local` | built-in | Custom font loading | Load Pinyin/Jyutping annotation fonts |
| `vtt.js` | ^0.13.x | VTT parsing (optional) | If parsing VTT files for subtitle data |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| XState | useReducer | useReducer lacks visualization, guard conditions, and nested states |
| Framer Motion | CSS transitions | CSS lacks AnimatePresence for exit animations |
| Custom Ruby subtitles | Native VTT | VTT doesn't support Ruby annotations for CJK text |
| XState | Zustand | Zustand is simpler but doesn't model state transitions explicitly |

**Installation:**
```bash
npm install xstate @xstate/react framer-motion
# vtt.js only if parsing VTT files: npm install vtt.js
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── video/
│       ├── InteractiveVideoPlayer.tsx   # Main component orchestrating all parts
│       ├── VideoStateMachine.ts         # XState machine definition
│       ├── VideoControls.tsx            # Custom controls with cue markers
│       ├── InteractionOverlay.tsx       # Overlay container for interactions
│       ├── SubtitleOverlay.tsx          # Custom Ruby-annotated subtitles
│       └── CuePointMarkers.tsx          # Progress bar markers
├── hooks/
│   └── useVideoPlayer.ts                # Hook wrapping XState machine
└── types/
    └── video.ts                         # CuePoint, SubtitleCue, VideoState types
```

### Pattern 1: XState Video Player Machine
**What:** Finite state machine modeling all player states and transitions
**When to use:** Core pattern for this phase - controls all video behavior
**Example:**
```typescript
// Source: XState docs + video player patterns
import { createMachine, assign } from "xstate";

interface VideoContext {
  currentTime: number;
  duration: number;
  cuePoints: CuePoint[];
  activeCuePoint: CuePoint | null;
  volume: number;
}

type VideoEvent =
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "TIME_UPDATE"; time: number }
  | { type: "CUE_POINT_REACHED"; cuePoint: CuePoint }
  | { type: "INTERACTION_COMPLETE" }
  | { type: "SEEK"; time: number };

export const videoPlayerMachine = createMachine({
  id: "videoPlayer",
  initial: "idle",
  context: {
    currentTime: 0,
    duration: 0,
    cuePoints: [],
    activeCuePoint: null,
    volume: 1,
  },
  states: {
    idle: {
      on: { PLAY: "playing" },
    },
    playing: {
      on: {
        PAUSE: "paused",
        TIME_UPDATE: {
          actions: assign({ currentTime: ({ event }) => event.time }),
        },
        CUE_POINT_REACHED: {
          target: "pausedForInteraction",
          actions: assign({ activeCuePoint: ({ event }) => event.cuePoint }),
        },
      },
    },
    paused: {
      on: { PLAY: "playing" },
    },
    pausedForInteraction: {
      // Video is paused, overlay is visible
      // Cannot resume until interaction complete
      on: {
        INTERACTION_COMPLETE: {
          target: "playing",
          actions: assign({ activeCuePoint: null }),
        },
      },
    },
  },
});
```

### Pattern 2: Mux Player Cue Points and Programmatic Control
**What:** Adding cue points to Mux Player and controlling playback programmatically
**When to use:** Detecting when to pause and triggering pause/play
**Example:**
```typescript
// Source: Mux documentation (Context7)
"use client";

import { useRef, useEffect } from "react";
import MuxPlayer from "@mux/mux-player-react";
import type { MuxPlayerRefAttributes } from "@mux/mux-player-react";

interface InteractivePlayerProps {
  playbackId: string;
  cuePoints: { timestamp: number; interactionId: string }[];
  onCuePointReached: (interactionId: string) => void;
}

export function InteractivePlayer({
  playbackId,
  cuePoints,
  onCuePointReached,
}: InteractivePlayerProps) {
  const playerRef = useRef<MuxPlayerRefAttributes>(null);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    // Wait for duration to be available before adding cue points
    const addCuePoints = () => {
      const muxCuePoints = cuePoints.map((cp) => ({
        startTime: cp.timestamp,
        value: { interactionId: cp.interactionId },
      }));
      player.addCuePoints(muxCuePoints);
    };

    if (player.duration) {
      addCuePoints();
    } else {
      player.addEventListener("durationchange", addCuePoints, { once: true });
    }

    // Listen for cue point changes
    const handleCuePointChange = () => {
      const active = player.activeCuePoint;
      if (active?.value?.interactionId) {
        onCuePointReached(active.value.interactionId);
      }
    };

    player.addEventListener("cuepointchange", handleCuePointChange);

    return () => {
      player.removeEventListener("cuepointchange", handleCuePointChange);
    };
  }, [cuePoints, onCuePointReached]);

  // Programmatic control methods
  const pause = () => playerRef.current?.pause();
  const play = () => playerRef.current?.play();

  return (
    <MuxPlayer
      ref={playerRef}
      playbackId={playbackId}
      // ... other props
    />
  );
}
```

### Pattern 3: Volume Fade for Smooth Pause Transitions
**What:** Gradually fade volume before pausing to avoid abrupt audio cutoff
**When to use:** Before pausing at cue points (user decision: 0.5-1 second fade)
**Example:**
```typescript
// Source: Web Audio patterns, HTML5 video volume property
function fadeVolumeAndPause(
  player: HTMLVideoElement,
  duration: number = 500 // milliseconds
): Promise<void> {
  return new Promise((resolve) => {
    const startVolume = player.volume;
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = startVolume / steps;
    let currentStep = 0;

    const interval = setInterval(() => {
      currentStep++;
      player.volume = Math.max(0, startVolume - volumeStep * currentStep);

      if (currentStep >= steps) {
        clearInterval(interval);
        player.pause();
        player.volume = startVolume; // Restore for when it resumes
        resolve();
      }
    }, stepDuration);
  });
}
```

### Pattern 4: Framer Motion Overlay with AnimatePresence
**What:** Smooth fade-in/out for interaction overlay
**When to use:** When video pauses for interaction, overlay appears
**Example:**
```typescript
// Source: Framer Motion docs (Context7)
import { motion, AnimatePresence } from "framer-motion";

interface InteractionOverlayProps {
  isVisible: boolean;
  children: React.ReactNode;
  onExitComplete?: () => void;
}

export function InteractionOverlay({
  isVisible,
  children,
  onExitComplete,
}: InteractionOverlayProps) {
  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isVisible && (
        <motion.div
          key="interaction-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }} // 300ms per user decision
          className="absolute inset-0 bg-black/80 flex"
        >
          {/* Left: Interaction prompt */}
          <div className="flex-1 p-6">
            {children}
          </div>
          {/* Right: Sidebar (hidden on mobile via responsive classes) */}
          <aside className="hidden md:block w-80 p-6 border-l border-white/10">
            {/* Vocabulary, notes, hints */}
          </aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### Pattern 5: Ruby Annotation Subtitles
**What:** Custom subtitle rendering with Pinyin/Jyutping above Chinese characters
**When to use:** All subtitle display (replacing native Mux captions)
**Example:**
```typescript
// Source: W3C Ruby Markup, MDN
import { useEffect, useState } from "react";

interface SubtitleCue {
  startTime: number;
  endTime: number;
  chinese: string;
  pinyin?: string;    // Mandarin romanization
  jyutping?: string;  // Cantonese romanization
}

interface SubtitleOverlayProps {
  currentTime: number;
  cues: SubtitleCue[];
  showPinyin: boolean;
  showJyutping: boolean;
}

export function SubtitleOverlay({
  currentTime,
  cues,
  showPinyin,
  showJyutping,
}: SubtitleOverlayProps) {
  const activeCue = cues.find(
    (cue) => currentTime >= cue.startTime && currentTime < cue.endTime
  );

  if (!activeCue) return null;

  // Parse Chinese characters and annotations
  // Assumes parallel arrays: chars[i] pairs with pinyin[i] and jyutping[i]
  const chars = activeCue.chinese.split("");
  const pinyinArr = activeCue.pinyin?.split(" ") || [];
  const jyutpingArr = activeCue.jyutping?.split(" ") || [];

  return (
    <div className="absolute bottom-16 left-0 right-0 text-center">
      <div className="inline-block bg-black/70 px-4 py-2 rounded">
        {chars.map((char, i) => (
          <ruby key={i} className="text-2xl text-white">
            {char}
            {(showPinyin || showJyutping) && (
              <rp>(</rp>
            )}
            {showPinyin && pinyinArr[i] && (
              <rt className="text-sm text-yellow-400">{pinyinArr[i]}</rt>
            )}
            {showJyutping && jyutpingArr[i] && (
              <rt className="text-sm text-cyan-400">{jyutpingArr[i]}</rt>
            )}
            {(showPinyin || showJyutping) && (
              <rp>)</rp>
            )}
          </ruby>
        ))}
      </div>
    </div>
  );
}
```

### Pattern 6: Progress Bar with Cue Point Markers
**What:** Visual indicators on progress bar showing where interactions occur
**When to use:** Always visible during playback
**Example:**
```typescript
// Source: react-video-markers patterns, custom implementation
interface CuePointMarkersProps {
  cuePoints: { timestamp: number; completed: boolean }[];
  duration: number;
}

export function CuePointMarkers({ cuePoints, duration }: CuePointMarkersProps) {
  if (duration === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none">
      {cuePoints.map((cp, i) => {
        const position = (cp.timestamp / duration) * 100;
        return (
          <div
            key={i}
            className={`absolute top-0 w-1 h-full ${
              cp.completed ? "bg-green-500" : "bg-yellow-500"
            }`}
            style={{ left: `${position}%` }}
            title={`Interaction at ${Math.floor(cp.timestamp)}s`}
          />
        );
      })}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Using native VTT captions for Chinese**: VTT doesn't support Ruby annotations - must use custom overlay
- **Polling currentTime for cue point detection**: Use Mux's native `cuepointchange` event instead
- **Managing player state with useState/useReducer**: XState prevents impossible states
- **Abrupt pause without volume fade**: User decision specifies smooth 0.5-1s fade
- **Hardcoding cue points in component**: Load from database, pass as props
- **Ignoring seek behavior**: User can seek past interactions, mark them incomplete

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| State machine | Custom if/else logic | XState | Guards, actions, visualization, prevents impossible states |
| Exit animations | CSS + state tracking | Framer Motion AnimatePresence | Handles animation completion before unmount |
| Cue point detection | Polling timeupdate | Mux `addCuePoints()` + `cuepointchange` | Native API, more accurate, less CPU |
| Ruby annotation parsing | Manual string splitting | Structured subtitle data | Store as separate fields in DB/JSON |
| Volume fading | Direct volume = 0 | Gradual fade function | Sounds more natural, user expectation |
| Mobile sidebar | Custom resize logic | Tailwind responsive classes | `md:block hidden` handles breakpoints |

**Key insight:** Video player state is complex enough to warrant a real state machine. XState provides visualization, type safety, and prevents bugs like "playing video with overlay visible."

## Common Pitfalls

### Pitfall 1: Race Conditions on Cue Point Change
**What goes wrong:** Multiple cuepointchange events fire, causing multiple pause calls
**Why it happens:** Events can fire rapidly if seek crosses multiple cue points
**How to avoid:** Use XState guard conditions to only transition if not already paused
**Warning signs:** Video stutters or pauses multiple times rapidly

### Pitfall 2: Mux Player Ref Not Ready
**What goes wrong:** `addCuePoints()` called before player initializes, throws error
**Why it happens:** Player ref is null on first render
**How to avoid:** Check `duration` or listen for `durationchange` before adding cue points
**Warning signs:** Console errors about undefined methods on null

### Pitfall 3: Native Captions Conflicting with Custom Overlay
**What goes wrong:** Both native VTT captions and custom Ruby subtitles show
**Why it happens:** Mux shows captions by default when available
**How to avoid:** Use `defaultHiddenCaptions={true}` prop, or don't add text tracks to Mux asset
**Warning signs:** Duplicate subtitles, one with annotations, one without

### Pitfall 4: Ruby Annotation Layout Issues
**What goes wrong:** Pinyin/Jyutping annotations overlap or spacing is wrong
**Why it happens:** Ruby text can be longer than base characters
**How to avoid:** Use CSS `ruby-align: center`, add letter-spacing to base text, test with real content
**Warning signs:** Text overlapping, unreadable annotations, inconsistent spacing

### Pitfall 5: Overlay Blocking Player Controls
**What goes wrong:** Can't adjust volume or seek while interaction overlay is visible
**Why it happens:** Overlay covers entire player including controls
**How to avoid:** User decision says controls remain visible - keep controls outside overlay z-index, or use partial overlay
**Warning signs:** Users report "can't do anything while paused"

### Pitfall 6: Lost Progress on Seek
**What goes wrong:** Student seeks backward, completes same interaction again, DB duplicates
**Why it happens:** No deduplication logic
**How to avoid:** Track completed interaction IDs, skip if already completed (but mark incomplete if seeking forward past them)
**Warning signs:** Duplicate entries in progress table

### Pitfall 7: AnimatePresence Exit Not Completing
**What goes wrong:** Overlay disappears instantly instead of fading out
**Why it happens:** Component unmounted before animation completes
**How to avoid:** Use `onExitComplete` callback, ensure key prop is stable
**Warning signs:** Abrupt transitions, no exit animation

## Code Examples

Verified patterns from official sources:

### XState with React Hook
```typescript
// Source: @xstate/react docs
import { useMachine } from "@xstate/react";
import { videoPlayerMachine } from "./VideoStateMachine";

export function useVideoPlayer(cuePoints: CuePoint[]) {
  const [state, send] = useMachine(
    videoPlayerMachine.provide({
      context: { cuePoints },
    })
  );

  return {
    state: state.value,
    context: state.context,
    play: () => send({ type: "PLAY" }),
    pause: () => send({ type: "PAUSE" }),
    updateTime: (time: number) => send({ type: "TIME_UPDATE", time }),
    cuePointReached: (cp: CuePoint) => send({ type: "CUE_POINT_REACHED", cuePoint: cp }),
    interactionComplete: () => send({ type: "INTERACTION_COMPLETE" }),
  };
}
```

### Local Font Loading for Annotations
```typescript
// Source: Next.js docs (Context7)
// app/layout.tsx or component
import localFont from "next/font/local";

// Custom font for Pinyin annotations
const pinyinFont = localFont({
  src: "./fonts/PinyinAnnotation.woff2",
  variable: "--font-pinyin",
  display: "swap",
});

// Apply via className or CSS variable
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={pinyinFont.variable}>
      <body>{children}</body>
    </html>
  );
}
```

### Disable Native Mux Captions
```typescript
// Source: Mux docs
<MuxPlayer
  playbackId={playbackId}
  defaultHiddenCaptions={true}  // Hide native captions by default
  // ... other props
/>
```

### Mobile-Responsive Overlay Layout
```typescript
// Source: Tailwind patterns
<div className="absolute inset-0 bg-black/80 flex flex-col md:flex-row">
  {/* Main content - full width on mobile, flex-1 on desktop */}
  <main className="flex-1 p-4 md:p-6 overflow-auto">
    {/* Interaction prompt */}
  </main>

  {/* Sidebar - drawer on mobile, permanent on desktop */}
  <Sheet>
    <SheetTrigger className="md:hidden fixed bottom-4 right-4">
      <Button variant="secondary">Resources</Button>
    </SheetTrigger>
    <SheetContent side="right" className="w-80">
      {/* Vocabulary, hints */}
    </SheetContent>
  </Sheet>

  {/* Desktop sidebar - always visible */}
  <aside className="hidden md:block w-80 border-l border-white/10 p-6">
    {/* Vocabulary, hints */}
  </aside>
</div>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Video.js plugins | Mux Player native cue points | 2024 | Simpler API, better integration |
| Redux for player state | XState state machines | 2023+ | Better modeling of finite states |
| Native VTT for all subtitles | Custom overlays for CJK | Always | VTT doesn't support Ruby |
| jQuery volume fades | CSS/JS requestAnimationFrame | 2020+ | Smoother, no dependency |
| Manual responsive breakpoints | Tailwind responsive classes | 2020+ | Declarative, less CSS |

**Deprecated/outdated:**
- `videojs-markers` - Video.js is less common now, Mux native is simpler
- XState v4 syntax - XState v5 has different API, use `createMachine` not `Machine`
- Manual useEffect cleanup for refs - React 18 strict mode handles better

## Open Questions

Things that couldn't be fully resolved:

1. **Subtitle data format from backend**
   - What we know: Need Chinese text + Pinyin + Jyutping per cue
   - What's unclear: Will it come as VTT files or JSON from API?
   - Recommendation: Store as structured JSON in DB (not VTT) since VTT can't represent Ruby annotations

2. **Exact font files for Pinyin/Jyutping**
   - What we know: User will provide .ttf/.otf files
   - What's unclear: Font names, whether same font for both
   - Recommendation: Plan for two separate font variables (`--font-pinyin`, `--font-jyutping`)

3. **Progress bar marker interaction**
   - What we know: Show markers on timeline
   - What's unclear: Can users click markers to jump? (Might skip interactions)
   - Recommendation: Show markers but don't make clickable (seeking via scrub is allowed per user decision)

4. **Subtitle timing sync offset**
   - What we know: User left to Claude's discretion
   - What's unclear: How common are timing issues with Mux?
   - Recommendation: Skip for now, add if users report sync issues (complexity not worth it initially)

## Sources

### Primary (HIGH confidence)
- Context7 `/websites/mux` - Cue points API, programmatic control, subtitle tracks, `defaultHiddenCaptions`
- Context7 `/websites/stately_ai` - XState state machine patterns for video player states
- Context7 `/grx7/framer-motion` - AnimatePresence, fade animations, exit transitions
- Context7 `/websites/nextjs` - `next/font/local` for custom font loading

### Secondary (MEDIUM confidence)
- [W3C Ruby Styling](https://www.w3.org/International/articles/ruby/styling.en.html) - CSS for Ruby annotations
- [Mux Player API Reference](https://www.mux.com/docs/guides/player-api-reference/react) - Full React props
- [React Video Markers](https://github.com/art-mironoff/react-video-markers) - Progress bar marker patterns
- [VolumeFader GitHub](https://github.com/bitfasching/VolumeFader) - Logarithmic volume fade patterns

### Tertiary (LOW confidence)
- WebSearch results on mobile responsive sidebars - general patterns, not video-specific
- WebSearch results on video player cue points - confirms XState approach is common

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - XState, Framer Motion, Mux native cue points all verified via Context7
- Architecture: HIGH - Patterns from official documentation with working code examples
- Pitfalls: HIGH - Common issues documented in GitHub issues and official docs

**Research date:** 2026-01-26
**Valid until:** 2026-02-26 (30 days - stable technologies)
