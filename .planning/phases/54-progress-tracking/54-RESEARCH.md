# Phase 54: Progress Tracking - Research

**Researched:** 2026-02-09
**Domain:** Video watch progress persistence, resume playback, vocabulary encounter tracking, watch history UI
**Confidence:** HIGH

## Summary

Phase 54 adds persistent progress tracking to the Video Listening Lab. The existing `videoSessions` table (Phase 50) stores one row per user+video combination but has no progress fields -- we need to add columns for `lastPositionMs`, `totalWatchedMs`, `completionPercent`, and `videoDurationMs`. The existing `useVideoSync` hook already polls `getCurrentTime()` at 250ms intervals and exposes `currentTimeMs` state, giving us the raw data feed. The main engineering challenge is debouncing these high-frequency updates into periodic API calls (every 10-30 seconds) while also catching the critical "user leaving page" edge case via `visibilitychange` and `beforeunload` events using `navigator.sendBeacon()` for reliability.

For vocabulary encounter tracking, the existing `useCharacterPopup.showPopup()` callback fires on every word hover/tap in the transcript. We need a new `videoVocabEncounters` table to record which words the student interacted with during each video session, deduplicated per session (first encounter only). This is a lightweight append operation that can piggyback on existing flows without major architectural changes.

The watch history page is a new route (`/dashboard/listening/history`) that queries `videoSessions` joined with the new progress fields, rendered as a list of cards with completion indicators. The sidebar already has a "Listening" link; the history page can be linked from within the listening lab or added as a sub-item.

**Primary recommendation:** Extend the existing `videoSessions` table with progress columns (schema migration), create a new `useWatchProgress` hook that debounces `currentTimeMs` into periodic API saves, handle page leave with `sendBeacon`, and add a `videoVocabEncounters` table for encounter tracking. No new npm packages needed -- `use-debounce` is already installed.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `drizzle-orm` | ^0.45.1 | Schema migration for new progress columns + encounters table | Already in use, project standard |
| `use-debounce` | ^10.1.0 | `useDebouncedCallback` for throttling progress save API calls | Already installed, used in `useCharacterPopup` |
| `react-youtube` | ^10.1.0 | `getDuration()` on player ready to capture video duration | Already in use via `YouTubePlayer` component |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `date-fns` | ^4.1.0 | Format "last watched" dates on history page | Already installed, used throughout project |
| `lucide-react` | ^0.563.0 | Icons for history page (Play, Clock, CheckCircle) | Already installed |
| `zod` | ^4.3.6 | Validate progress update API payloads | Already installed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `use-debounce` useDebouncedCallback | Raw `setTimeout` / `useRef` debounce | Simpler but error-prone; `use-debounce` handles cleanup, cancellation, leading/trailing correctly |
| `navigator.sendBeacon` for page-leave | `fetch` with `keepalive: true` | `sendBeacon` is more reliable for page unload, wider browser support for this specific use case |
| Adding columns to `videoSessions` | Separate `videoProgress` table | Extra JOIN for every query; progress is 1:1 with sessions, so adding columns is simpler and more efficient |
| Server-side duration detection | Client-side `getDuration()` | YouTube API only exposes duration from the player; server would need a separate YouTube Data API call (requires API key) |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── video.ts              # MODIFIED: add progress columns to videoSessions + new videoVocabEncounters table
├── hooks/
│   └── useWatchProgress.ts   # NEW: debounced progress save + page-leave handling
├── app/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       └── listening/
│   │           ├── page.tsx           # EXISTING: passes sessionId to ListeningClient
│   │           ├── ListeningClient.tsx # MODIFIED: wire useWatchProgress + encounter tracking
│   │           └── history/
│   │               ├── page.tsx       # NEW: server component, auth guard, fetch history
│   │               └── HistoryClient.tsx # NEW: client component, history list UI
│   └── api/
│       └── video/
│           ├── progress/
│           │   └── route.ts           # NEW: POST save progress, GET resume position
│           └── encounters/
│               └── route.ts           # NEW: POST log vocabulary encounter
```

### Pattern 1: Debounced Progress Save (Hook)
**What:** A custom hook that accepts the current video state from `useVideoSync` and periodically saves to the server.
**When to use:** Always active when a video session is playing.
**Example:**
```typescript
// Source: project pattern from useCharacterPopup + useVideoSync
function useWatchProgress(opts: {
  sessionId: string | null;
  currentTimeMs: number;
  videoDurationMs: number | null;
  isPlaying: boolean;
}) {
  const saveProgress = useDebouncedCallback(
    async (positionMs: number, durationMs: number) => {
      if (!opts.sessionId) return;
      await fetch("/api/video/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: opts.sessionId,
          lastPositionMs: positionMs,
          videoDurationMs: durationMs,
        }),
      });
    },
    10_000, // Save every 10 seconds (at most)
    { leading: false, trailing: true }
  );

  // Trigger debounced save when currentTimeMs changes significantly
  useEffect(() => {
    if (opts.isPlaying && opts.currentTimeMs > 0 && opts.videoDurationMs) {
      saveProgress(opts.currentTimeMs, opts.videoDurationMs);
    }
  }, [opts.currentTimeMs, opts.isPlaying, opts.videoDurationMs, saveProgress]);

  // Page-leave: flush via sendBeacon
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && opts.sessionId) {
        saveProgress.flush(); // Attempt normal flush first
        navigator.sendBeacon(
          "/api/video/progress",
          JSON.stringify({
            sessionId: opts.sessionId,
            lastPositionMs: currentTimeRef.current,
            videoDurationMs: opts.videoDurationMs,
          })
        );
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [opts.sessionId, opts.videoDurationMs, saveProgress]);
}
```

### Pattern 2: Monotonic Progress with GREATEST()
**What:** Use SQL `GREATEST()` to ensure completion percentage only increases, never decreases.
**When to use:** Every progress update (prevents rewinding from lowering completion).
**Example:**
```typescript
// Source: existing pattern from src/lib/progress.ts (upsertLessonProgress)
await db
  .update(videoSessions)
  .set({
    lastPositionMs: positionMs,
    totalWatchedMs: sql`${videoSessions.totalWatchedMs} + ${deltaMs}`,
    completionPercent: sql`GREATEST(${videoSessions.completionPercent}, ${newPercent})`,
    videoDurationMs: durationMs,
    updatedAt: new Date(),
  })
  .where(eq(videoSessions.id, sessionId));
```

### Pattern 3: sendBeacon for Reliable Page-Leave Saves
**What:** Use `navigator.sendBeacon()` which is specifically designed to survive page unload. The API route must handle `text/plain` content type since sendBeacon sends a `Blob`.
**When to use:** On `visibilitychange` (hidden) event, which fires more reliably than `beforeunload` on mobile.
**Example:**
```typescript
// Source: MDN Web API / standard browser pattern
// sendBeacon sends as text/plain by default with string body
// The API route must parse JSON from the raw body
navigator.sendBeacon(
  "/api/video/progress",
  new Blob(
    [JSON.stringify({ sessionId, lastPositionMs, videoDurationMs })],
    { type: "application/json" }
  )
);
```

### Pattern 4: Resume from Last Position
**What:** On video load, fetch the session's `lastPositionMs` and call `player.seekTo()` in `onReady`.
**When to use:** When loading a previously watched video.
**Example:**
```typescript
// In ListeningClient or useWatchProgress
const handlePlayerReady = useCallback((player: YTPlayer) => {
  // ... existing setup ...
  if (lastPositionMs && lastPositionMs > 0) {
    player.seekTo(lastPositionMs / 1000, true);
  }
}, [lastPositionMs]);
```

### Pattern 5: Vocabulary Encounter Tracking via Callback Wrapping
**What:** Wrap the existing `showPopup` callback to also log the encounter.
**When to use:** On every word hover/tap in the transcript during video playback.
**Example:**
```typescript
// Wrap showPopup in ListeningClient
const handleWordHover = useCallback(
  (word: string, index: number, element: HTMLElement) => {
    showPopup(word, element);
    // Fire-and-forget encounter log
    if (sessionId) {
      logEncounter(sessionId, word); // batched/debounced
    }
  },
  [showPopup, sessionId]
);
```

### Anti-Patterns to Avoid
- **Saving on every poll tick:** The `useVideoSync` hook polls at 250ms. Saving progress on each tick would create 4 API calls/second. Always debounce to 10-30 second intervals.
- **Using `beforeunload` alone for page-leave:** `beforeunload` does NOT fire reliably on mobile browsers. Use `visibilitychange` (hidden) as the primary signal, with `beforeunload` as a desktop fallback.
- **Storing encounters in localStorage:** Encounters need to be server-persisted for the watch history page and future analytics. Client-only storage would be lost across devices.
- **Creating a separate progress table:** The `videoSessions` table already has a 1:1 relationship with user+video. Adding columns is simpler than a separate table with an FK join.
- **Using `fetch()` in `beforeunload`/`visibilitychange`:** Standard `fetch()` is cancelled when the page unloads. `sendBeacon` is the correct API for this use case. Alternatively, `fetch` with `keepalive: true` works but has less browser support for this pattern.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce timing | Custom setTimeout logic | `useDebouncedCallback` from `use-debounce` | Handles cleanup, cancellation, flush, leading/trailing correctly |
| Page-leave persistence | Custom `beforeunload` with `fetch` | `navigator.sendBeacon()` on `visibilitychange` | Designed for page-unload; survives navigation; doesn't block |
| Monotonic progress | Client-side max() check | SQL `GREATEST()` in UPDATE | Race condition proof; server is source of truth |
| Video duration | YouTube Data API call | `player.getDuration()` from react-youtube | No API key needed; available client-side from player instance |
| Completion percentage | Custom calculation per save | `Math.round((lastPositionMs / videoDurationMs) * 100)` capped at 100 | Simple formula, compute on server from authoritative values |

**Key insight:** The existing codebase already has all the patterns needed (debounce library, upsert with GREATEST, ref-based polling, Drizzle migrations). This phase is integration work, not greenfield.

## Common Pitfalls

### Pitfall 1: Progress Saves Lost on Page Close
**What goes wrong:** User closes tab mid-video, progress since last debounced save is lost.
**Why it happens:** Standard `fetch()` is cancelled during page unload. `beforeunload` doesn't reliably fire on mobile.
**How to avoid:** Use `visibilitychange` event (fires on tab switch, page close, and mobile app backgrounding) with `navigator.sendBeacon()` which is designed to survive page transitions.
**Warning signs:** Users report losing progress when switching tabs or closing the browser.

### Pitfall 2: Completion Percentage Goes Backward
**What goes wrong:** User watches to 80%, rewinds to 20%, progress shows 20%.
**Why it happens:** Saving raw `currentTimeMs / durationMs` without monotonic guard.
**How to avoid:** Use `GREATEST()` in SQL UPDATE so completion percentage can only increase. Track `lastPositionMs` separately (this CAN go backward for resume) vs `completionPercent` (monotonic).
**Warning signs:** Progress bar jumping down when user rewinds.

### Pitfall 3: Debounce Interval Too Short = Excessive API Calls
**What goes wrong:** Server overloaded with progress saves, Neon connection pool exhausted.
**Why it happens:** Setting debounce to 1-2 seconds creates ~30-60 calls per minute per active user.
**How to avoid:** Use 10-second debounce interval. With `currentTimeMs` throttled at 200ms delta (v7-7 decision), the effect triggers less frequently than raw poll rate, but still needs debouncing for API calls.
**Warning signs:** High API route latency, database connection errors.

### Pitfall 4: sendBeacon Content-Type Mismatch
**What goes wrong:** API route receives `sendBeacon` request but can't parse the body.
**Why it happens:** `sendBeacon(url, string)` sends as `text/plain`. Next.js `request.json()` may fail if Content-Type isn't `application/json`.
**How to avoid:** Send as `new Blob([JSON.stringify(data)], { type: "application/json" })` to set the correct Content-Type. Alternatively, handle both content types in the API route.
**Warning signs:** 400/500 errors in the progress API route only on page close.

### Pitfall 5: Video Duration Not Available Immediately
**What goes wrong:** First progress save has `null` duration, completion percentage can't be computed.
**Why it happens:** `player.getDuration()` returns 0 until the video metadata loads, which may be after `onReady` fires.
**How to avoid:** Capture duration in `onPlay` event (guaranteed to have metadata) rather than `onReady`. Store in a ref and pass to the progress hook.
**Warning signs:** `completionPercent` stuck at 0 or NaN for the first save.

### Pitfall 6: Vocabulary Encounters Create Excessive DB Writes
**What goes wrong:** User hovers over 100 words in a minute, generating 100 INSERT queries.
**Why it happens:** Each hover triggers an immediate encounter log.
**How to avoid:** Batch encounters client-side (accumulate in a Set, flush every 10-15 seconds or on page leave). Use `INSERT ... ON CONFLICT DO NOTHING` to deduplicate at the database level.
**Warning signs:** Database latency spikes during heavy reading sessions.

### Pitfall 7: Self-Fetch API Route in Server Component (Known Bug)
**What goes wrong:** Watch history page server component fetches its own API route and gets 401.
**Why it happens:** Server components that self-fetch API routes don't forward auth cookies (documented in MEMORY.md).
**How to avoid:** Query the database directly in the server component using Drizzle, as done in `progress-dashboard.ts`.
**Warning signs:** History page always shows empty for authenticated users.

### Pitfall 8: totalWatchedMs Counting Paused Time
**What goes wrong:** `totalWatchedMs` inflates because it counts time when video is paused.
**Why it happens:** Computing delta as `currentMs - previousMs` includes pause duration.
**How to avoid:** Only accumulate `totalWatchedMs` delta when `isPlaying` is true. Compute delta server-side as `MIN(timeSinceLastSave, lastPositionMs - previousPositionMs)` to catch edge cases.
**Warning signs:** `totalWatchedMs` exceeds video duration.

## Code Examples

### Schema Migration: Add Progress Columns to videoSessions
```typescript
// Source: project pattern from src/db/schema/video.ts
// Add to videoSessions table definition:
lastPositionMs: integer("last_position_ms").notNull().default(0),
videoDurationMs: integer("video_duration_ms"),  // null until first play
totalWatchedMs: integer("total_watched_ms").notNull().default(0),
completionPercent: integer("completion_percent").notNull().default(0), // 0-100
```

### New Table: videoVocabEncounters
```typescript
// Source: project pattern from vocabulary.ts + video.ts
export const videoVocabEncounters = pgTable(
  "video_vocab_encounters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    videoSessionId: uuid("video_session_id")
      .notNull()
      .references(() => videoSessions.id, { onDelete: "cascade" }),
    word: varchar("word", { length: 50 }).notNull(),  // the Chinese word encountered
    positionMs: integer("position_ms"),  // video position when encountered (nullable)
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("video_vocab_encounters_session_idx").on(table.videoSessionId),
    unique("video_vocab_encounters_session_word").on(
      table.videoSessionId,
      table.word
    ),
  ]
);
```

### Progress Save API Route
```typescript
// Source: project pattern from src/app/api/progress/[lessonId]/route.ts
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { sessionId, lastPositionMs, videoDurationMs } = body;

  // Verify session belongs to user
  const session = await db.query.videoSessions.findFirst({
    where: and(
      eq(videoSessions.id, sessionId),
      eq(videoSessions.userId, user.id)
    ),
  });
  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Compute completion (monotonic via GREATEST)
  const newPercent = videoDurationMs > 0
    ? Math.min(100, Math.round((lastPositionMs / videoDurationMs) * 100))
    : 0;

  await db
    .update(videoSessions)
    .set({
      lastPositionMs,
      videoDurationMs: videoDurationMs ?? session.videoDurationMs,
      completionPercent: sql`GREATEST(${videoSessions.completionPercent}, ${newPercent})`,
      updatedAt: new Date(),
    })
    .where(eq(videoSessions.id, sessionId));

  return NextResponse.json({ ok: true });
}
```

### Resume Position on Video Load
```typescript
// Source: existing extract-captions route returns session data
// In the extract-captions response, include lastPositionMs:
return NextResponse.json({
  session: existingSession,  // already includes lastPositionMs after migration
  captions: cachedCaptions,
  cached: true,
});

// In ListeningClient, after video loads:
useEffect(() => {
  if (session?.lastPositionMs && session.lastPositionMs > 0 && playerReady) {
    seekToTime(session.lastPositionMs / 1000);
  }
}, [session, playerReady]);
```

### Watch History Server Component Query
```typescript
// Source: project pattern from src/lib/progress-dashboard.ts
// Query DB directly (NOT self-fetch API route -- Pitfall 7)
export async function getWatchHistory(userId: string) {
  return db
    .select({
      id: videoSessions.id,
      youtubeVideoId: videoSessions.youtubeVideoId,
      title: videoSessions.title,
      completionPercent: videoSessions.completionPercent,
      lastPositionMs: videoSessions.lastPositionMs,
      totalWatchedMs: videoSessions.totalWatchedMs,
      updatedAt: videoSessions.updatedAt,
    })
    .from(videoSessions)
    .where(eq(videoSessions.userId, userId))
    .orderBy(desc(videoSessions.updatedAt));
}
```

### Batch Vocabulary Encounters
```typescript
// Source: project pattern from useCharacterPopup.ts
// In the hook, accumulate encounters in a Set and flush periodically
const pendingEncountersRef = useRef(new Set<string>());

const flushEncounters = useCallback(async () => {
  if (!sessionId || pendingEncountersRef.current.size === 0) return;
  const words = Array.from(pendingEncountersRef.current);
  pendingEncountersRef.current.clear();

  await fetch("/api/video/encounters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, words }),
  });
}, [sessionId]);

// Add word on hover/tap
const trackEncounter = useCallback((word: string) => {
  pendingEncountersRef.current.add(word);
}, []);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `beforeunload` for save | `visibilitychange` + `sendBeacon` | ~2020+ | Mobile reliability dramatically improved; `beforeunload` unreliable on iOS/Android |
| Separate progress table | Columns on session table (1:1) | Project convention | Fewer JOINs, simpler queries for history page |
| Client-side localStorage progress | Server-persisted progress | Standard for LMS | Cross-device, survives cache clear, enables coach visibility |
| Full `fetch()` on page close | `navigator.sendBeacon()` | Browser standard | Survives page unload, doesn't block navigation |

**Deprecated/outdated:**
- `window.onbeforeunload` as sole page-leave handler: unreliable on mobile browsers (iOS Safari, Chrome mobile)
- `XMLHttpRequest` synchronous in `beforeunload`: blocked by most modern browsers for performance reasons

## Open Questions

1. **Should `totalWatchedMs` track unique time or cumulative time?**
   - What we know: Cumulative is simpler (just add delta). Unique requires tracking watched segments (complex).
   - What's unclear: Whether coach visibility needs "actual unique engagement time" vs "total minutes spent."
   - Recommendation: Use cumulative for now (simple, sufficient for Phase 54 requirements). The requirements say "total time watched" not "unique time watched." Can be refined in Phase 55 if coaches need more granularity.

2. **Should the history page be a sub-route of `/dashboard/listening` or a standalone route?**
   - What we know: Sidebar already has "Listening" at `/dashboard/listening`. Adding a sub-page `/dashboard/listening/history` follows existing patterns.
   - What's unclear: Whether to add a separate sidebar item or just a link within the listening page.
   - Recommendation: Use `/dashboard/listening/history` as a sub-route. Add a "History" button/link within the listening lab page header. No new sidebar item needed (keeps sidebar clean).

3. **Should video title be fetched and stored?**
   - What we know: The `videoSessions.title` column exists but is nullable and not currently populated (Phase 50 left it as "populated when metadata fetched").
   - What's unclear: Whether YouTube oEmbed or the IFrame API exposes the title reliably.
   - Recommendation: Capture `player.getVideoData().title` in `onReady` or `onPlay` and save it with the first progress update. This makes the history page much more useful (shows video titles instead of just IDs).

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/db/schema/video.ts` -- existing videoSessions/videoCaptions schema
- Codebase analysis: `src/hooks/useVideoSync.ts` -- polling mechanism, currentTimeMs state, v7-7/v7-8 decisions
- Codebase analysis: `src/hooks/useCharacterPopup.ts` -- useDebouncedCallback pattern, vocabulary tracking
- Codebase analysis: `src/lib/progress.ts` -- upsertLessonProgress with GREATEST() pattern
- Codebase analysis: `src/app/api/progress/[lessonId]/route.ts` -- existing progress API pattern
- Codebase analysis: `src/lib/progress-dashboard.ts` -- direct DB query pattern (avoids self-fetch 401 bug)
- Drizzle ORM docs (Context7 `/llmstxt/orm_drizzle_team_llms_txt`) -- onConflictDoUpdate, returning, upsert patterns
- MDN Web Docs: `navigator.sendBeacon()` -- designed for analytics/progress data on page unload
- MDN Web Docs: `visibilitychange` event -- fires reliably on mobile and desktop

### Secondary (MEDIUM confidence)
- `use-debounce` v10.x API: `useDebouncedCallback` with `flush()`, `leading`/`trailing` options -- verified in project's existing usage
- YouTube IFrame API: `getDuration()`, `getCurrentTime()`, `getVideoData()` -- verified via react-youtube wrapper in project

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed, patterns already established in codebase
- Architecture: HIGH -- follows existing project patterns (schema extension, hooks, API routes, server queries)
- Pitfalls: HIGH -- most pitfalls identified from known browser behavior (sendBeacon, visibilitychange) and existing project bugs (self-fetch 401)
- Vocabulary encounters: HIGH -- straightforward new table + callback wrapping
- History page: HIGH -- follows existing dashboard page patterns

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (stable domain, no fast-moving dependencies)
