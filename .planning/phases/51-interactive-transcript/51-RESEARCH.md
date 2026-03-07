# Phase 51: Interactive Transcript - Research

**Researched:** 2026-02-09
**Domain:** Video transcript sync, auto-scroll, YouTube IFrame Player API time tracking, split-screen layout
**Confidence:** HIGH

## Summary

Phase 51 adds an interactive transcript panel alongside the YouTube video player: a scrollable list of all caption lines, with the currently-playing line highlighted and auto-scrolled into view, and click-to-jump navigation. The core technical challenge is bridging the YouTube IFrame Player API's lack of a native `timeupdate` event with React's rendering model while maintaining smooth 60fps scrolling.

The YouTube IFrame Player API does not fire periodic time updates. Unlike HTML5 `<audio>` / `<video>` elements (which fire `timeupdate` at 4-66Hz), the YouTube player only fires `onStateChange` when the state transitions (play, pause, buffer, end). To track playback time, you must **poll `getCurrentTime()`** on an interval. The `event.target` from react-youtube callbacks is the raw `YT.Player` object where `getCurrentTime()` returns a synchronous `number` (not a Promise), making it safe for high-frequency polling. A 250ms interval strikes the right balance: accurate enough for sentence-level sync (captions typically span 1-5 seconds), inexpensive enough to avoid jank.

The critical performance insight (from Metaview's engineering blog on transcript sync) is: **do NOT store `currentTime` in React state**. Polling at 250ms and calling `setState` on every tick triggers 4 re-renders/second of the entire transcript list. Instead, store the current time in a `useRef` and use a separate ref-based comparison to determine if the active caption index has changed -- only then update state (which triggers a re-render to move the highlight). This means re-renders happen only on caption transitions (every 1-5 seconds), not on every poll tick.

**Primary recommendation:** Build a `useVideoSync` custom hook that polls `getCurrentTime()` via `setInterval` at 250ms, uses binary search to find the active caption, stores time in a ref, and only calls `setActiveCaptionIndex` when the index changes. Use `scrollIntoView({ behavior: "smooth", block: "center" })` on the active line's ref to auto-scroll.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-youtube` | ^10.1.0 | YouTube embed (already installed) | Exposes raw YT.Player via event.target for synchronous getCurrentTime() |
| React `useRef` + `setInterval` | React 19 | Poll getCurrentTime() without re-renders | Standard pattern for YouTube time tracking; no native timeupdate event exists |
| `scrollIntoView()` | Browser API | Auto-scroll transcript to active line | Built-in, smooth behavior, no library needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `cn()` (already installed) | via `clsx` + `tailwind-merge` | Conditional class names for active/inactive lines | Highlight the active transcript line |
| `lucide-react` | (already installed) | Icons if needed (e.g., scroll-to-current button) | Optional UX enhancement |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `setInterval` polling | `requestAnimationFrame` loop | rAF fires at 60fps (every 16ms) -- overkill for sentence-level sync. Burns CPU when video is paused (rAF still fires). setInterval at 250ms is sufficient and cheaper |
| `setInterval` polling | YouTube postMessage interception | Undocumented internal protocol; relies on YouTube broadcasting `infoDelivery` messages. Could break without notice. Not recommended for production |
| `scrollIntoView` | Manual `scrollTop` calculation | More control over animation, but scrollIntoView with `behavior: "smooth"` handles it natively and correctly |
| Storing currentTime in state | Ref-only approach | State approach causes 4+ re-renders/sec; ref approach re-renders only on caption changes (every 1-5 sec) |

**Installation:**
```bash
# No new dependencies needed. All tools are already installed or are browser APIs.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   └── video/
│       ├── YouTubePlayer.tsx       # (existing) - add onPlay/onPause/onStateChange props
│       ├── TranscriptPanel.tsx     # NEW: scrollable transcript container
│       └── TranscriptLine.tsx      # NEW: single caption line (click handler, highlight)
├── hooks/
│   └── useVideoSync.ts            # NEW: polls getCurrentTime, finds active caption
└── app/(dashboard)/dashboard/listening/
    └── ListeningClient.tsx         # MODIFY: split-screen layout, wire sync hook
```

### Pattern 1: Ref-Based Time Tracking (No Re-Render Polling)
**What:** Poll `getCurrentTime()` at 250ms intervals but store the result in a `useRef`, not `useState`. Only update React state when the active caption index changes.
**When to use:** Always -- this is the core sync mechanism.
**Example:**
```typescript
// src/hooks/useVideoSync.ts
import { useRef, useState, useCallback, useEffect } from "react";

interface CaptionLine {
  startMs: number;
  endMs: number;
  text: string;
  sequence: number;
}

// Binary search: find the caption whose startMs <= currentMs < endMs
function findActiveCaptionIndex(
  captions: CaptionLine[],
  currentMs: number
): number {
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

  // Verify the candidate is still within its endMs
  if (result >= 0 && currentMs < captions[result].endMs) {
    return result;
  }

  return -1; // Between captions (gap)
}

export function useVideoSync(captions: CaptionLine[]) {
  const playerRef = useRef<YT.Player | null>(null);
  const currentTimeRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPlayingRef = useRef(false);

  const [activeCaptionIndex, setActiveCaptionIndex] = useState(-1);

  // Start/stop polling based on play state
  const startPolling = useCallback(() => {
    if (intervalRef.current) return;

    intervalRef.current = setInterval(() => {
      const player = playerRef.current;
      if (!player) return;

      const timeS = player.getCurrentTime(); // synchronous on raw YT.Player
      const timeMs = Math.round(timeS * 1000);
      currentTimeRef.current = timeMs;

      const newIndex = findActiveCaptionIndex(captions, timeMs);
      // Only update state if index actually changed
      setActiveCaptionIndex((prev) => (prev === newIndex ? prev : newIndex));
    }, 250);
  }, [captions]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => stopPolling, [stopPolling]);

  // Player event handlers
  const handlePlayerReady = useCallback((player: YT.Player) => {
    playerRef.current = player;
  }, []);

  const handlePlay = useCallback(() => {
    isPlayingRef.current = true;
    startPolling();
  }, [startPolling]);

  const handlePause = useCallback(() => {
    isPlayingRef.current = false;
    stopPolling();
  }, [stopPolling]);

  const handleEnd = useCallback(() => {
    isPlayingRef.current = false;
    stopPolling();
  }, [stopPolling]);

  // Seek to a caption's start time
  const seekToCaption = useCallback((index: number) => {
    const player = playerRef.current;
    if (!player || index < 0 || index >= captions.length) return;

    const seconds = captions[index].startMs / 1000;
    player.seekTo(seconds, true);
    setActiveCaptionIndex(index);
  }, [captions]);

  return {
    activeCaptionIndex,
    handlePlayerReady,
    handlePlay,
    handlePause,
    handleEnd,
    seekToCaption,
  };
}
```

### Pattern 2: Auto-Scroll with scrollIntoView
**What:** Attach a ref to each transcript line (or use a ref callback on the active line). When `activeCaptionIndex` changes, call `scrollIntoView` on the active element.
**When to use:** Whenever the active caption changes during playback.
**Example:**
```typescript
// Inside TranscriptPanel.tsx
const activeLineRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  if (activeCaptionIndex >= 0 && activeLineRef.current) {
    activeLineRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center", // center in viewport, not just "nearest"
    });
  }
}, [activeCaptionIndex]);

// In the render:
{captions.map((caption, index) => (
  <TranscriptLine
    key={caption.sequence}
    ref={index === activeCaptionIndex ? activeLineRef : undefined}
    isActive={index === activeCaptionIndex}
    text={caption.text}
    onClick={() => seekToCaption(index)}
  />
))}
```

### Pattern 3: Split-Screen Layout
**What:** Restructure the listening page layout so the video player takes the left 2/3 and the transcript panel takes the right 1/3 on desktop. On mobile, stack vertically (video on top, transcript below).
**When to use:** When captions are loaded and available.
**Example:**
```typescript
// Current layout (Phase 50):
// <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//   <div className="lg:col-span-2">  {/* video */}
//   <div className="space-y-4">       {/* caption status + upload */}

// New layout (Phase 51):
// <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
//   <div className="lg:col-span-2">  {/* video + caption status + upload */}
//   <div>                            {/* transcript panel (full height) */}
```

### Pattern 4: TranscriptLine as forwardRef Component
**What:** The TranscriptLine component must accept a `ref` so the parent can scroll it into view. Use `React.forwardRef` (or in React 19, the `ref` prop is natively supported on function components).
**When to use:** Every transcript line component.
**Example:**
```typescript
// React 19 supports ref as a regular prop (no forwardRef needed)
interface TranscriptLineProps {
  ref?: React.Ref<HTMLDivElement>;
  isActive: boolean;
  text: string;
  startMs: number;
  onClick: () => void;
}

export function TranscriptLine({
  ref,
  isActive,
  text,
  startMs,
  onClick,
}: TranscriptLineProps) {
  return (
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
        "hover:bg-zinc-800",
        isActive
          ? "bg-cyan-900/30 border-l-2 border-cyan-400 text-white"
          : "text-zinc-400"
      )}
    >
      <span className="text-xs text-zinc-600 mr-2">
        {formatTimestamp(startMs)}
      </span>
      {text}
    </div>
  );
}
```

### Anti-Patterns to Avoid
- **Storing `currentTime` in React state on every poll:** Causes 4+ re-renders per second of the entire transcript list. Use refs for time, state only for `activeCaptionIndex`.
- **Using `requestAnimationFrame` for polling:** Fires at 60fps even when video is paused. setInterval at 250ms is sufficient for sentence-level sync and stops when paused.
- **Linear scan for active caption on every poll:** O(n) on every tick. Use binary search for O(log n). With 200+ captions this matters.
- **Polling when video is not playing:** Wasteful. Only poll during `PLAYING` state. Start on play, stop on pause/end/buffer.
- **Using `getInternalPlayer()` from react-youtube for getCurrentTime:** The internal player wraps methods in Promises. Use `event.target` from `onReady` instead -- it's the raw synchronous `YT.Player`.
- **Using `scrollIntoView({ block: "nearest" })` for auto-scroll:** "nearest" only scrolls if the element is outside the viewport. For a transcript, you want the active line centered, so use `block: "center"`.
- **Creating a new setInterval on every render:** The interval setup must be in a `useCallback`/`useRef` pattern with proper cleanup to avoid interval leaks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time tracking from YouTube | Custom postMessage listener or YouTube event hacks | `setInterval` + `getCurrentTime()` polling | postMessage is undocumented internal protocol; polling is the standard documented approach |
| Smooth scrolling to active line | Manual scroll animation with `scrollTop` + `requestAnimationFrame` | `scrollIntoView({ behavior: "smooth", block: "center" })` | Browser-native smooth scrolling, handles edge cases (top/bottom of container) |
| Active caption lookup | Array.find() or linear scan on every poll | Binary search on sorted `startMs` array | Captions are pre-sorted by `sequence`/`startMs`, O(log n) vs O(n) |
| Timestamp formatting | Custom math for MM:SS | Simple helper function (< 5 lines) | Trivial enough to inline, no library needed |

**Key insight:** This phase is fundamentally a sync problem, not a library problem. No third-party libraries are needed beyond what's already installed. The challenge is architectural: keeping polling efficient, minimizing re-renders, and making auto-scroll feel natural.

## Common Pitfalls

### Pitfall 1: Re-Render Storm from Time Polling
**What goes wrong:** The transcript re-renders 4 times per second, causing UI jank, especially with 100+ caption lines.
**Why it happens:** Storing `currentTimeMs` in React state and updating it every 250ms. Even if `activeCaptionIndex` hasn't changed, every state update triggers a re-render.
**How to avoid:** Store currentTime in a `useRef`. Only update React state (`setActiveCaptionIndex`) when the index actually changes. Use a functional state updater (`prev => prev === newIndex ? prev : newIndex`) to prevent no-op re-renders.
**Warning signs:** React DevTools shows 4+ renders/sec on TranscriptPanel. Scroll becomes choppy.

### Pitfall 2: Interval Leak on Component Unmount or Caption Change
**What goes wrong:** Multiple overlapping intervals after navigating away or changing videos, causing memory leaks or stale state.
**Why it happens:** setInterval not properly cleaned up in useEffect, or new interval started without clearing the old one.
**How to avoid:** Store intervalRef in a useRef. Always clear before starting a new one. Return cleanup function from useEffect.
**Warning signs:** Multiple console logs per tick. Stale caption index after loading new video.

### Pitfall 3: getCurrentTime() Returns Promise (Wrong Player Reference)
**What goes wrong:** `player.getCurrentTime()` returns a Promise instead of a number, breaking the synchronous polling loop.
**Why it happens:** Using `react-youtube`'s `getInternalPlayer()` which returns the `youtube-player` wrapper (promisified methods) instead of the raw `YT.Player` from `event.target`.
**How to avoid:** Capture the player from `event.target` in the `onReady` callback. This is the raw YouTube IFrame Player API object where `getCurrentTime()` is synchronous.
**Warning signs:** `NaN` in time display, or `[object Promise]` in comparisons.

### Pitfall 4: scrollIntoView Fights with User Scroll
**What goes wrong:** User manually scrolls the transcript to read ahead, but auto-scroll yanks it back to the active line every 250ms.
**Why it happens:** No mechanism to detect manual scroll intent vs. programmatic scroll.
**How to avoid:** Track whether the user has manually scrolled. Disable auto-scroll for a few seconds after user interaction. Re-enable when the user clicks a line or when a new caption becomes active after a threshold. A simple approach: set `isUserScrolling = true` on the scroll container's `onScroll` event (with a debounce reset to false after 3-5 seconds of no user scroll). Only call `scrollIntoView` when `!isUserScrolling`.
**Warning signs:** Transcript "jumps" while user is trying to read ahead.

### Pitfall 5: Empty Captions Array
**What goes wrong:** Binary search crashes or returns incorrect index when captions array is empty.
**Why it happens:** User loaded a video but captions haven't been extracted/uploaded yet. The transcript panel renders but the sync hook receives an empty array.
**How to avoid:** Guard against empty captions in the hook. Show an empty state message in TranscriptPanel. Don't start polling until captions.length > 0.
**Warning signs:** Runtime error in `findActiveCaptionIndex`, blank transcript with no explanation.

### Pitfall 6: Layout Shift When Transcript Appears
**What goes wrong:** Page layout jumps when captions load and the transcript panel appears, disrupting the video viewing experience.
**Why it happens:** The transcript column is conditionally rendered and the grid recalculates.
**How to avoid:** Always render the transcript panel container (with a placeholder/skeleton), regardless of whether captions are loaded. Populate it when captions arrive.
**Warning signs:** Video player resizes or shifts position when captions load.

## Code Examples

Verified patterns from official sources and existing codebase:

### Binary Search for Active Caption
```typescript
// O(log n) lookup -- captions are sorted by startMs
function findActiveCaptionIndex(
  captions: { startMs: number; endMs: number }[],
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
```

### Timestamp Formatter
```typescript
// Format milliseconds to MM:SS display
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
```

### User Scroll Detection Pattern
```typescript
// Pause auto-scroll when user manually scrolls, resume after timeout
const isUserScrollingRef = useRef(false);
const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const handleContainerScroll = useCallback(() => {
  isUserScrollingRef.current = true;

  // Reset after 4 seconds of no scroll
  if (scrollTimeoutRef.current) {
    clearTimeout(scrollTimeoutRef.current);
  }
  scrollTimeoutRef.current = setTimeout(() => {
    isUserScrollingRef.current = false;
  }, 4000);
}, []);

// In the scrollIntoView effect:
useEffect(() => {
  if (
    activeCaptionIndex >= 0 &&
    activeLineRef.current &&
    !isUserScrollingRef.current
  ) {
    activeLineRef.current.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}, [activeCaptionIndex]);
```

### YouTubePlayer Enhancement for Sync Events
```typescript
// Existing YouTubePlayer.tsx -- add event forwarding props
interface YouTubePlayerProps {
  videoId: string;
  onReady?: (player: YT.Player) => void;  // already exists
  onPlay?: () => void;    // NEW
  onPause?: () => void;   // NEW
  onEnd?: () => void;     // NEW
  className?: string;
}

export function YouTubePlayer({
  videoId,
  onReady,
  onPlay,
  onPause,
  onEnd,
  className,
}: YouTubePlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);

  const handleReady = useCallback(
    (event: YouTubeEvent) => {
      playerRef.current = event.target;
      onReady?.(event.target);
    },
    [onReady]
  );

  return (
    <div className={cn("aspect-video", className)}>
      <YouTube
        videoId={videoId}
        iframeClassName="w-full h-full rounded-lg"
        className="w-full h-full"
        onReady={handleReady}
        onPlay={onPlay ? () => onPlay() : undefined}
        onPause={onPause ? () => onPause() : undefined}
        onEnd={onEnd ? () => onEnd() : undefined}
        opts={{
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            cc_load_policy: 0,
          },
        }}
      />
    </div>
  );
}
```

### react-youtube Event Callback Signatures
```typescript
// Source: react-youtube d.ts (verified in node_modules)
// event.target = raw YT.Player (synchronous methods)
// event.data = state integer for onStateChange

// Player state constants:
// -1 = unstarted
//  0 = ended (YT.PlayerState.ENDED)
//  1 = playing (YT.PlayerState.PLAYING)
//  2 = paused (YT.PlayerState.PAUSED)
//  3 = buffering (YT.PlayerState.BUFFERING)
//  5 = video cued (YT.PlayerState.CUED)

// Key methods on event.target (YT.Player):
// getCurrentTime(): number      -- SYNCHRONOUS (seconds, float)
// seekTo(seconds, allowSeekAhead): void
// getPlayerState(): number
// getDuration(): number
// getPlaybackRate(): number
// playVideo(): void
// pauseVideo(): void
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `forwardRef` for ref passing | `ref` as regular prop in React 19 | React 19 (Dec 2024) | Simpler component signatures, no `forwardRef` wrapper needed |
| `timeupdate` event (HTML5 video) | `setInterval` polling (YouTube iframe) | Always (YouTube has never had timeupdate) | Must build your own time tracking; this is a YouTube limitation |
| State-based currentTime tracking | Ref-based with state only for index changes | Best practice since ~2023 | Dramatically fewer re-renders (4/sec to 0.2-1/sec) |

**Deprecated/outdated:**
- `React.forwardRef`: Still works in React 19 but unnecessary. React 19 passes `ref` as a regular prop to function components.
- YouTube postMessage interception: Never officially supported. Some community code uses it, but it relies on undocumented internal messages.

## Open Questions

1. **Optimal polling interval**
   - What we know: 250ms is widely used. YouTube captions typically span 1-5 seconds. Metaview blog used the native `timeupdate` event (~250ms in most browsers).
   - What's unclear: Whether 250ms feels responsive enough for short captions (< 1 second). Some implementations use 100ms.
   - Recommendation: Start with 250ms. If user testing reveals late highlights on short captions, reduce to 150ms. The performance cost difference is minimal since we only update state on index changes.

2. **User scroll detection threshold**
   - What we know: Auto-scroll must pause when user scrolls manually. 3-5 seconds is a common timeout.
   - What's unclear: The ideal timeout before re-enabling auto-scroll. Too short = annoying (snaps back while reading). Too long = user forgets it's disabled.
   - Recommendation: Use 4 seconds. Also re-enable auto-scroll immediately when user clicks a transcript line (since that's an explicit navigation intent). Consider adding a small "scroll to current" button that appears when auto-scroll is paused.

3. **Transcript panel height on mobile**
   - What we know: On desktop, the transcript takes the right 1/3 column and should fill the available height. On mobile, it stacks below the video.
   - What's unclear: What height the transcript panel should have on mobile. Full-screen height would push other content off-screen.
   - Recommendation: On mobile, set `max-h-[50vh]` for the transcript scroll container. On desktop, use `h-[calc(100vh-12rem)]` or similar to fill available space.

## Sources

### Primary (HIGH confidence)
- YouTube IFrame Player API Reference (Google official) - Verified `getCurrentTime()` returns seconds as float, `seekTo(seconds, allowSeekAhead)` parameters, `onStateChange` event with state integers. URL: https://developers.google.com/youtube/iframe_api_reference
- `react-youtube` TypeScript definitions (verified in `node_modules/react-youtube/dist/YouTube.d.ts`) - Event callback signatures, `YouTubeEvent<T>` type with `data` and `target` properties, all available props
- `youtube-player` source code (verified in `node_modules/youtube-player/dist/`) - Confirms `promisifyPlayer` wraps all methods in Promises; `event.target` from callbacks is the raw `YT.Player`, not the promisified wrapper
- Existing codebase: `src/components/video/YouTubePlayer.tsx` (current player), `src/app/(dashboard)/dashboard/listening/ListeningClient.tsx` (current layout), `src/db/schema/video.ts` (caption data model with `startMs`/`endMs`/`sequence`)
- `scrollIntoView` MDN documentation - `behavior: "smooth"`, `block: "center"` options

### Secondary (MEDIUM confidence)
- [Metaview Blog: Syncing a Transcript with Audio in React](https://www.metaview.ai/resources/blog/syncing-a-transcript-with-audio-in-react) - Performance pattern: use refs not state for currentTime, DOM manipulation outside React render cycle. Verified approach aligns with React best practices.
- [GitHub Gist: YouTube Time Change Events Without Polling](https://gist.github.com/zavan/75ed641de5afb1296dbc02185ebf1ea0) - Documented the postMessage approach (rejected as undocumented/fragile, but confirms there is no official timeupdate event)
- Existing codebase auto-scroll patterns: `src/components/chat/ChatPanel.tsx` (scrollIntoView with smooth behavior), `src/components/voice/ConversationTranscript.tsx` (scrollTop-based auto-scroll on new content)

### Tertiary (LOW confidence)
- Optimal polling interval (250ms vs 100ms vs 150ms) - Based on community patterns and the typical 4Hz rate of HTML5 timeupdate. No rigorous benchmarking found.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies needed. YouTube IFrame API docs are official Google documentation. react-youtube types verified in node_modules.
- Architecture: HIGH - Ref-based polling pattern is well-documented (Metaview blog, multiple React YouTube implementations). Binary search for sorted timestamp array is textbook. scrollIntoView is browser-native.
- Pitfalls: HIGH - Re-render storm verified by understanding React state update behavior. Promise vs synchronous getCurrentTime verified by reading actual node_modules source code. User scroll conflict is widely reported in transcript sync implementations.

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable domain; YouTube IFrame API rarely changes, React 19 ref behavior is stable)
