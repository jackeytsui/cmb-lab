# Phase 53: Playback & Practice Controls - Research

**Researched:** 2026-02-09
**Domain:** YouTube IFrame API playback control, dual subtitles, section looping, auto-pause, Azure TTS integration
**Confidence:** HIGH

## Summary

Phase 53 adds five distinct practice features to the Video Listening Lab: (1) playback speed control, (2) dual Chinese + English subtitle overlay on the video, (3) section loop mode where students select a transcript range to repeat, (4) auto-pause that stops after each caption line, and (5) a per-line TTS play button for sentence read-aloud via Azure TTS.

The technical foundation is solid. The YouTube IFrame Player API exposes `setPlaybackRate(rate)` and `getAvailablePlaybackRates()` directly on the raw `YT.Player` object, which is already captured via `event.target` in the existing `useVideoSync` hook's `playerRef`. The existing 250ms polling loop in `useVideoSync` provides the timing backbone for both auto-pause (detect caption boundary crossing) and loop mode (detect end-of-range, seekTo start-of-range). No new dependencies are needed for speed control, loop, or auto-pause -- they extend the existing `useVideoSync` hook.

For dual subtitles, English captions must be extracted alongside Chinese ones. The existing `youtube-transcript` package supports `{ lang: "en" }` to fetch English captions from the same video. These can be stored as a parallel array (same index as Chinese captions) or matched by timestamp overlap. The SubtitleOverlay component (already built for the Mux interactive player) needs adaptation for the YouTube listening lab -- it currently renders Chinese-only with ruby annotations. The dual overlay should show Chinese on top, English below, each independently togglable.

For sentence TTS, the existing `useTTS` hook and `/api/tts` endpoint are fully functional and tested in the Reader's SentenceControls component. The pattern is proven: click a play button, call `speak(text, { language })`, show loading/playing states. The only adaptation needed is adding the TTS button to each TranscriptLine component.

**Primary recommendation:** Extend `useVideoSync` to expose `playerRef` and add `setPlaybackRate`/`seekTo` controls. Build loop mode and auto-pause as state flags consumed by the polling loop. Extract English captions in parallel during `extract-captions` API call. Reuse `useTTS` directly in ListeningClient with per-line play buttons in TranscriptLine.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `react-youtube` | ^10.1.0 | YouTube embed (already installed) | Exposes raw YT.Player with `setPlaybackRate()`, `seekTo()`, `pauseVideo()`, `playVideo()` |
| `youtube-transcript` | ^1.2.1 | Extract English captions (already installed) | Same library used for Chinese extraction; pass `{ lang: "en" }` for English |
| `useTTS` hook | (existing) | Sentence-level TTS playback | Already built and proven in Reader; `speak(text, { language })` API |
| `useVideoSync` hook | (existing) | Time polling, caption sync | Extend with speed/loop/auto-pause controls; no new hook needed |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lucide-react` | (already installed) | Icons (Play, Repeat, Pause, Volume2, Gauge) | UI controls for speed, loop, auto-pause, TTS |
| `cn()` | (already installed) | Conditional styling for active states | Toggle button states, loop range highlighting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `useVideoSync` | New `usePlaybackControls` hook | Would duplicate player ref management and polling; single hook is simpler |
| `youtube-transcript` for English | Manual YouTube page scraping | Unnecessary complexity; same library handles both languages |
| Client-side SRT timestamp matching for dual subtitles | Server-side pre-matching | Server-side adds latency and complexity; client-side matching by index is simpler when both caption arrays exist |
| Azure TTS for sentence read-aloud | Web Speech API (browser built-in) | Web Speech API has inconsistent Chinese voice quality across browsers; Azure provides consistent high-quality neural voices |

**Installation:**
```bash
# No new dependencies needed. All tools are already installed.
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── hooks/
│   └── useVideoSync.ts          # MODIFY: add setPlaybackRate, loop state, auto-pause state, expose playerRef
├── components/
│   └── video/
│       ├── YouTubePlayer.tsx     # MODIFY: add onPlaybackRateChange callback prop
│       ├── TranscriptPanel.tsx   # MODIFY: add loop range selection, TTS button per line
│       ├── TranscriptLine.tsx    # MODIFY: add TTS play button, loop range visual indicator
│       ├── TranscriptToolbar.tsx # MODIFY: add speed selector, loop toggle, auto-pause toggle, subtitle toggles
│       └── DualSubtitleOverlay.tsx # NEW: Chinese + English subtitle overlay on video
├── lib/
│   └── captions.ts              # MODIFY: add extractEnglishCaptions function
└── app/
    ├── (dashboard)/dashboard/listening/
    │   └── ListeningClient.tsx   # MODIFY: wire speed/loop/auto-pause/TTS/subtitles
    └── api/video/
        └── extract-captions/
            └── route.ts          # MODIFY: extract English captions alongside Chinese
```

### Pattern 1: Playback Speed Control via YouTube IFrame API
**What:** The raw `YT.Player` object (already stored in `useVideoSync`'s `playerRef`) exposes `setPlaybackRate(rate)` and `getAvailablePlaybackRates()`. Speed control is a simple wrapper that calls `playerRef.current.setPlaybackRate(rate)` and tracks the current rate in state.
**When to use:** When student selects a speed from the UI.
**Example:**
```typescript
// Inside useVideoSync (extended)
const [playbackRate, setPlaybackRateState] = useState(1);

const setPlaybackRate = useCallback((rate: number) => {
  const player = playerRef.current;
  if (!player) return;
  player.setPlaybackRate(rate);
  setPlaybackRateState(rate);
}, []);

// Available rates from YouTube API (confirmed via Context7):
// [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
// Phase requirement specifies: [0.5, 0.75, 1, 1.25, 1.5, 2]
```

### Pattern 2: Loop Mode via Polling Loop Extension
**What:** Loop mode uses the existing 250ms polling loop to detect when playback reaches the end of the selected range, then seeks back to the start. The loop range is defined by two caption indices (start and end). When the current time exceeds the end caption's `endMs`, call `player.seekTo(startCaption.startMs / 1000, true)`.
**When to use:** When student selects a range of transcript lines and enables loop mode.
**Example:**
```typescript
// Inside useVideoSync polling callback (extended)
if (loopRange && isPlayingRef.current) {
  const { startIndex, endIndex } = loopRange;
  const endMs = captions[endIndex].endMs;
  const startMs = captions[startIndex].startMs;

  if (currentMs >= endMs) {
    player.seekTo(startMs / 1000, true);
    return; // Skip index update this tick -- seekTo will trigger new position
  }
}
```

### Pattern 3: Auto-Pause via Caption Boundary Detection
**What:** Auto-pause detects when a caption line finishes (current time crosses `endMs` of the active caption) and pauses the video. The student clicks to continue, which resumes playback. Uses a ref to track the last-paused caption index to avoid re-pausing on the same line.
**When to use:** When auto-pause toggle is enabled.
**Example:**
```typescript
// Inside useVideoSync polling callback (extended)
if (autoPauseEnabled && isPlayingRef.current) {
  const prevIndex = activeCaptionIndexRef.current;
  const newIndex = findActiveCaptionIndex(captions, currentMs);

  // Caption just ended: we were on a valid caption, now we're in a gap or on next caption
  if (prevIndex >= 0 && prevIndex !== newIndex && prevIndex !== lastAutoPausedRef.current) {
    player.pauseVideo();
    lastAutoPausedRef.current = prevIndex;
    // Don't stop polling -- let the student click to resume
    // Callback notifies the UI to show "click to continue"
    onAutoPause?.();
  }
}
```

### Pattern 4: Dual Subtitle Overlay
**What:** A video overlay showing Chinese text on top and English translation below, each independently togglable. Position absolutely over the YouTube player. Match the current playback time to both Chinese and English caption arrays using the same binary search approach.
**When to use:** When the video has both Chinese and English captions available.
**Example:**
```typescript
// DualSubtitleOverlay.tsx
interface DualSubtitleOverlayProps {
  currentTimeMs: number;
  chineseCaptions: CaptionLine[];
  englishCaptions: CaptionLine[] | null;
  showChinese: boolean;
  showEnglish: boolean;
}

// Find active caption for each language independently (timestamps may differ)
const chineseIndex = showChinese ? findActiveCaptionIndex(chineseCaptions, currentTimeMs) : -1;
const englishIndex = showEnglish && englishCaptions
  ? findActiveCaptionIndex(englishCaptions, currentTimeMs)
  : -1;
```

### Pattern 5: Per-Line TTS Button Reusing Existing Hook
**What:** Add a small play button next to each transcript line. On click, call `speak(lineText, { language: "zh-CN" })` from the `useTTS` hook. Track which line is currently speaking to show loading/playing state on the correct button.
**When to use:** Every transcript line.
**Example:**
```typescript
// In ListeningClient (or TranscriptPanel wrapper)
const { speak, stop, isLoading: ttsLoading, isPlaying: ttsPlaying } = useTTS();
const [ttsLineIndex, setTtsLineIndex] = useState(-1);

const handleTtsPlay = useCallback((index: number, text: string) => {
  setTtsLineIndex(index);
  speak(text, { language: "zh-CN" }); // or "zh-HK" based on user preference
}, [speak]);
```

### Anti-Patterns to Avoid
- **Using YouTube's built-in loop parameter (`loop=1`):** This loops the entire video, not a selected section. Section looping must be implemented via polling + seekTo.
- **Pausing video from outside the polling loop for auto-pause:** Race conditions with the polling interval. Handle pause detection inside the poll callback for consistent timing.
- **Creating a separate polling interval for loop/auto-pause:** One 250ms interval handles all time-based features. Adding more intervals wastes resources and creates timing conflicts.
- **Fetching English captions on the client:** Same as Chinese -- `youtube-transcript` scrapes YouTube HTML server-side. Must be an API call.
- **Playing TTS while video is playing:** Should pause the video before playing TTS, or at minimum lower video volume. Overlapping audio is confusing for language learning.
- **Storing English captions in a separate DB table:** Overkill. Store as a parallel array in memory (client state) or as an optional field on the existing caption data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Playback speed control | Custom video speed manipulation | `player.setPlaybackRate(rate)` (YT IFrame API) | Native API, handles codec compatibility, buffering adjustments |
| Text-to-speech for sentence read-aloud | Browser Web Speech API with Chinese voices | Existing `useTTS` hook + `/api/tts` Azure endpoint | Web Speech API has inconsistent Chinese voice quality; Azure is consistent and already working |
| English caption extraction | Custom YouTube page scraping for English tracks | `youtube-transcript` with `{ lang: "en" }` | Same library already used for Chinese, handles all the scraping edge cases |
| Active caption binary search | `Array.find()` linear scan | Existing `findActiveCaptionIndex` in `useVideoSync` | Already O(log n), tested, handles gaps between captions |
| Section looping | YouTube `loop` parameter or custom timer | Extend existing polling loop with seekTo | Polling loop already runs; adding seekTo check is 3 lines |

**Key insight:** Phase 53 is almost entirely UI and control logic on top of existing infrastructure. No new npm packages, no new API endpoints (beyond extending the existing extract-captions route), no new database tables. The polling loop, TTS hook, caption extraction, and subtitle overlay patterns are all proven.

## Common Pitfalls

### Pitfall 1: YouTube setPlaybackRate Ignores Unsupported Rates
**What goes wrong:** Setting a rate that YouTube doesn't support for the current video silently fails or uses the closest available rate.
**Why it happens:** Not all videos support all rates. `getAvailablePlaybackRates()` returns the actually-supported list.
**How to avoid:** Call `getAvailablePlaybackRates()` after the player is ready and only show buttons for supported rates. The standard rates (0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2) are supported by virtually all videos, but validate to be safe.
**Warning signs:** Speed button appears to do nothing, or rate snaps to a different value.

### Pitfall 2: Loop Mode seekTo Causes Double-Trigger
**What goes wrong:** When the polling loop detects the end of the loop range and calls `seekTo`, the next poll tick might still see a time >= endMs (seekTo is asynchronous), causing another seekTo before the first completes.
**Why it happens:** `seekTo` on YouTube is not instantaneous. The player needs time to buffer and jump.
**How to avoid:** After calling `seekTo` for a loop, set a "seeking" flag (ref) and skip loop checks for the next 2-3 poll ticks (500-750ms). Clear the flag when the position is confirmed back in range.
**Warning signs:** Video stutters or rapidly seeks at the loop point.

### Pitfall 3: Auto-Pause Re-Triggers on Same Caption
**What goes wrong:** After the student clicks "continue" to resume from an auto-pause, the video immediately pauses again on the same caption.
**Why it happens:** The current time is still within the just-completed caption's range when playback resumes. The next poll tick sees the same boundary and re-pauses.
**How to avoid:** Track `lastAutoPausedIndex` in a ref. Only auto-pause when transitioning from caption index N to a different index (N+1, gap, etc.), and only if N !== lastAutoPausedIndex. Reset `lastAutoPausedIndex` when the student manually seeks or when a new caption starts that wasn't the last paused one.
**Warning signs:** Video pauses, student clicks continue, video immediately pauses again.

### Pitfall 4: English Captions Unavailable or Misaligned
**What goes wrong:** English captions don't exist for many Chinese-language YouTube videos, or their timestamps don't align with Chinese captions.
**Why it happens:** Not all videos have English subtitles. Auto-generated English subtitles for Chinese audio may have different timestamp boundaries than Chinese subtitles.
**How to avoid:** Make English subtitles optional. Show a "No English subtitles available" message. Use independent binary search for each language's captions (don't assume 1:1 index mapping). Match by timestamp overlap, not by array index.
**Warning signs:** English subtitle shows text for the wrong spoken content, or English toggle button does nothing.

### Pitfall 5: TTS Audio Overlaps with Video Audio
**What goes wrong:** Student clicks TTS play button while video is playing, resulting in two audio streams simultaneously.
**Why it happens:** No coordination between video playback and TTS playback.
**How to avoid:** When TTS starts, pause the video. When TTS ends, optionally resume the video (or let the student resume manually). The `useTTS` hook already fires `isPlaying` state changes that can trigger video pause/resume.
**Warning signs:** Overlapping audio, student can't distinguish TTS pronunciation from video audio.

### Pitfall 6: Loop Range Selection UX Confusion
**What goes wrong:** Student doesn't understand how to select a loop range, or accidentally selects single lines repeatedly instead of a range.
**Why it happens:** No established UX pattern for "select start point, then select end point" in a transcript.
**How to avoid:** Use a clear two-step flow: (1) Enter loop mode via toolbar toggle, (2) Click first line (marks as loop start with visual indicator), (3) Click second line (marks as loop end, starts looping). Show visual highlighting on the selected range. Provide a "clear loop" button. Consider shift-click for range selection.
**Warning signs:** Students toggling loop mode on and off without understanding the range selection, or only selecting single lines.

### Pitfall 7: Azure TTS Credentials Not Configured
**What goes wrong:** TTS play buttons show loading spinner then error for all users.
**Why it happens:** Azure Speech credentials (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) are noted as "not yet configured" in STATE.md pending todos.
**How to avoid:** The TTS button should gracefully handle 503 errors from the TTS API. Show "TTS not available" message. The button should still be rendered (not hidden) so the UI is consistent when credentials are eventually configured.
**Warning signs:** All TTS requests return 503. Error message in the TTS button area.

## Code Examples

Verified patterns from official sources and existing codebase:

### YouTube Player setPlaybackRate
```typescript
// Source: YouTube IFrame Player API Reference (Context7) + youtube-player types
// Player methods available on event.target (raw YT.Player):
player.setPlaybackRate(1.5);               // Set speed
player.getPlaybackRate();                  // Get current speed: number
player.getAvailablePlaybackRates();        // Get supported speeds: number[]
// Returns e.g. [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
```

### Extended useVideoSync Return Type
```typescript
// Additions to existing useVideoSync hook return
interface UseVideoSyncReturn {
  // Existing
  activeCaptionIndex: number;
  handlePlayerReady: (player: YTPlayer) => void;
  handlePlay: () => void;
  handlePause: () => void;
  handleEnd: () => void;
  seekToCaption: (index: number) => void;

  // NEW for Phase 53
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  availableRates: number[];
  loopRange: { startIndex: number; endIndex: number } | null;
  setLoopRange: (range: { startIndex: number; endIndex: number } | null) => void;
  autoPauseEnabled: boolean;
  setAutoPauseEnabled: (enabled: boolean) => void;
  isAutoPaused: boolean;          // True when auto-pause has fired
  resumeFromAutoPause: () => void; // Continue after auto-pause
  currentTimeMs: number;           // Expose for subtitle overlay sync
}
```

### English Caption Extraction (Parallel with Chinese)
```typescript
// Source: youtube-transcript API (same package, different lang param)
import { YoutubeTranscript } from "youtube-transcript";

const ENGLISH_LANG_CODES = ["en", "en-US", "en-GB"];

export async function extractEnglishCaptions(
  videoId: string
): Promise<NormalizedCaption[] | null> {
  for (const lang of ENGLISH_LANG_CODES) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      return transcript.map((item, idx) => ({
        text: item.text.trim(),
        startMs: Math.round(item.offset),
        endMs: Math.round(item.offset + item.duration),
        sequence: idx + 1,
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (message.includes("language") || message.includes("available")) continue;
      // Don't throw for English -- it's optional
      return null;
    }
  }
  return null;
}
```

### DualSubtitleOverlay Component
```typescript
// Positioned absolutely over the YouTubePlayer container
// Chinese on top (larger), English below (smaller)
function DualSubtitleOverlay({
  currentTimeMs,
  chineseCaptions,
  englishCaptions,
  showChinese,
  showEnglish,
}: DualSubtitleOverlayProps) {
  const chineseIndex = showChinese
    ? findActiveCaptionIndex(chineseCaptions, currentTimeMs)
    : -1;
  const englishIndex = showEnglish && englishCaptions
    ? findActiveCaptionIndex(englishCaptions, currentTimeMs)
    : -1;

  if (chineseIndex < 0 && englishIndex < 0) return null;

  return (
    <div className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none z-10">
      {chineseIndex >= 0 && (
        <div className="bg-black/70 backdrop-blur-sm px-4 py-1.5 rounded-lg max-w-[90%]">
          <p className="text-xl text-white text-center">
            {chineseCaptions[chineseIndex].text}
          </p>
        </div>
      )}
      {englishIndex >= 0 && (
        <div className="bg-black/60 backdrop-blur-sm px-4 py-1 rounded-lg max-w-[90%]">
          <p className="text-sm text-zinc-200 text-center">
            {englishCaptions[englishIndex].text}
          </p>
        </div>
      )}
    </div>
  );
}
```

### TTS Per-Line Pattern (from existing SentenceControls)
```typescript
// Source: existing src/components/reader/SentenceControls.tsx pattern
// Reuse useTTS hook; track which line is active
const { speak, stop, isLoading, isPlaying } = useTTS();
const [ttsLineIndex, setTtsLineIndex] = useState(-1);

const handleTtsPlay = useCallback((index: number, text: string) => {
  // Pause video before playing TTS to avoid audio overlap
  playerRef.current?.pauseVideo();
  setTtsLineIndex(index);
  speak(text, { language: "zh-CN" });
}, [speak]);

// Pass to TranscriptLine:
<TranscriptLine
  // ...existing props
  onTtsPlay={() => handleTtsPlay(index, displayTexts?.[index] ?? caption.text)}
  isTtsLoading={ttsLineIndex === index && isLoading}
  isTtsPlaying={ttsLineIndex === index && isPlaying}
/>
```

### Loop Range Visual Highlighting
```typescript
// In TranscriptLine, highlight lines within the loop range
const isInLoopRange = loopRange
  ? index >= loopRange.startIndex && index <= loopRange.endIndex
  : false;

// Visual: left border in amber for loop range lines
className={cn(
  "px-3 py-2 rounded-md cursor-pointer transition-colors text-sm",
  isActive
    ? "bg-cyan-900/30 border-l-2 border-cyan-400 text-white font-medium"
    : isInLoopRange
      ? "bg-amber-900/20 border-l-2 border-amber-400/50 text-zinc-300"
      : "text-zinc-400 border-l-2 border-transparent",
)}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube `loop=1` playerVar for looping | Programmatic seekTo in polling loop | Always (loop=1 only loops entire video) | Full control over loop section start/end |
| Browser Web Speech API for Chinese TTS | Azure Neural TTS (zh-CN-XiaoxiaoNeural, zh-HK-HiuMaanNeural) | Project decision (Phase 46) | Consistent voice quality, prosody control via SSML |
| Hardcoded playback rates in UI | `getAvailablePlaybackRates()` from player | YouTube IFrame API best practice | Adapts to what the video actually supports |
| Custom audio player for TTS playback | `new Audio(blobUrl)` with client-side cache | Existing useTTS pattern (Phase 46) | Blob URL caching avoids re-fetching, cleanup on unmount |

**Deprecated/outdated:**
- YouTube `setPlaybackQuality()`: Deprecated by YouTube. Quality is now automatically managed. Not relevant to this phase but noted to avoid confusion with `setPlaybackRate()`.

## Open Questions

1. **English caption storage strategy**
   - What we know: English captions are optional and used only for the dual subtitle overlay. They are not segmented/interactive like Chinese captions.
   - What's unclear: Whether to store English captions in the DB alongside Chinese ones, or treat them as ephemeral (fetched each time, cached in client state only).
   - Recommendation: Store in client state only for now. English captions are display-only (no word segmentation, no vocabulary tracking, no progress). Fetching them is fast and avoids schema migration. If persistence becomes needed later (offline support, coach assignments with English subtitles), add a DB column then.

2. **Loop mode interaction with auto-pause**
   - What we know: Both features modify playback behavior based on the polling loop.
   - What's unclear: Should auto-pause fire within a loop range? If so, the loop effectively becomes "play one line, pause, continue, play next line, pause, continue, ... reach end, seek to start, repeat."
   - Recommendation: When both are enabled simultaneously, auto-pause takes precedence within the loop range. This is actually a powerful study mode: loop a section and pause after each line to practice. The polling loop should check auto-pause first, then loop boundary.

3. **Subtitle overlay positioning over YouTube iframe**
   - What we know: YouTube embeds in an iframe. CSS `position: absolute` on a sibling div can overlay the iframe. The existing SubtitleOverlay for Mux uses this pattern.
   - What's unclear: Whether YouTube's iframe will capture pointer events, preventing the overlay from being clickable (not needed -- subtitles are display-only, `pointer-events-none`). Whether YouTube's built-in captions UI will conflict visually.
   - Recommendation: The YouTubePlayer already sets `cc_load_policy: 0` to hide YouTube's built-in captions. The DualSubtitleOverlay should use `pointer-events-none` since subtitles don't need interaction. Wrap the YouTubePlayer and overlay in a `relative` container div.

4. **TTS language detection per caption line**
   - What we know: The useTTS hook accepts `language: "zh-CN" | "zh-HK"`. The video's `captionLang` field stores the language code.
   - What's unclear: Whether to use the video's `captionLang` to determine TTS language, or let the user choose.
   - Recommendation: Use the user's existing language preference (from `useLanguagePreference` hook) for TTS language, not the video's caption language. A Cantonese learner watching a Mandarin-captioned video still wants Cantonese TTS (or vice versa). Alternatively, detect based on the caption source language, but user preference is simpler and more predictable.

## Sources

### Primary (HIGH confidence)
- YouTube IFrame Player API Reference (Context7, library ID: `/websites/developers_google_youtube`) - `setPlaybackRate()`, `getAvailablePlaybackRates()`, `seekTo()`, `pauseVideo()`, `playVideo()` methods confirmed
- `youtube-player` type definitions (verified in `node_modules/youtube-player/dist/types.js.flow`) - Full method list including `setPlaybackRate`, `seekTo`, `getPlaybackRate`, `getAvailablePlaybackRates`
- `react-youtube` type definitions (verified in `node_modules/react-youtube/dist/YouTube.d.ts`) - `onPlaybackRateChange` event callback
- `youtube-transcript` type definitions (verified in `node_modules/youtube-transcript/dist/index.d.ts`) - `TranscriptConfig.lang` for language selection
- Existing codebase: `src/hooks/useVideoSync.ts` (polling loop, binary search), `src/hooks/useTTS.ts` (speak/stop/isLoading/isPlaying), `src/lib/tts.ts` (Azure TTS SSML), `src/components/reader/SentenceControls.tsx` (per-sentence TTS pattern), `src/components/video/SubtitleOverlay.tsx` (overlay positioning), `src/lib/captions.ts` (extractChineseCaptions pattern)

### Secondary (MEDIUM confidence)
- YouTube IFrame API documentation for `setPlaybackRate` behavior - Confirmed: sets suggested rate, player picks closest available, fires `onPlaybackRateChange`. URL: https://developers.google.com/youtube/iframe_api_reference
- GitHub Gist: YouTube iframe API play/pause at specified time - Confirms programmatic pause/seek pattern for section control. URL: https://gist.github.com/meongx/0b9e52cc0ba53e9d035b

### Tertiary (LOW confidence)
- English caption availability on Chinese YouTube videos - Based on general experience. Many Chinese-language videos have English auto-generated subtitles, but availability varies widely.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All features use existing libraries and hooks. YouTube IFrame API methods verified in type definitions.
- Architecture: HIGH - Extends proven patterns (polling loop, binary search, TTS hook, subtitle overlay). Loop and auto-pause are simple additions to the existing polling callback.
- Pitfalls: HIGH - Double-trigger on seekTo, auto-pause re-trigger, and TTS/video audio overlap are known patterns from similar implementations. Azure credential issue documented in STATE.md.
- English captions: MEDIUM - `youtube-transcript` with `{ lang: "en" }` follows the same pattern as Chinese extraction (verified in type defs), but actual availability on Chinese videos varies.

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable domain; YouTube IFrame API rarely changes, existing hooks are project-internal)
