# Phase 50: Video Foundation - Research

**Researched:** 2026-02-09
**Domain:** YouTube embed, caption extraction, SRT/VTT parsing, Drizzle schema
**Confidence:** HIGH

## Summary

Phase 50 establishes the Video Listening Lab foundation: a YouTube video player with URL input, automatic Chinese caption extraction, manual SRT/VTT upload fallback, and the database schema to store it all. The core technical challenges are: (1) extracting Chinese captions from YouTube without an official API key, (2) parsing uploaded SRT/VTT files into a normalized format, (3) embedding YouTube iframes with proper CSP configuration, and (4) designing a schema that supports future phases (interactive transcript, progress tracking, assignments).

The `youtube-transcript` package (npm) is the standard choice for caption extraction -- it's TypeScript, lightweight, supports language selection via `lang` parameter, and throws informative errors with available language codes when a requested language isn't found. For SRT/VTT parsing, `@plussub/srt-vtt-parser` is dependency-free, TypeScript-native, and outputs a clean `{from, to, text, id}` structure. For the YouTube embed, use `react-youtube` (v10.1.0, ~460K weekly downloads) which wraps the YouTube IFrame Player API and exposes `seekTo`, `getCurrentTime`, `getDuration` through event targets -- critical for Phase 51-54 features. The project's existing CSP in `next.config.ts` must be updated to allow `frame-src https://www.youtube.com https://www.youtube-nocookie.com`.

**Primary recommendation:** Use `youtube-transcript` + `@plussub/srt-vtt-parser` + `react-youtube`. Store captions as rows in a `video_captions` table with `start_ms`/`end_ms`/`text` columns (not as a single JSON blob) to enable per-line queries for transcript sync, loop mode, and vocabulary tracking in later phases.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `youtube-transcript` | ^1.2.1 | Extract YouTube captions server-side | TypeScript, 520+ GitHub stars, language selection via `lang` param, throws with available languages on miss. Unofficial API but the standard npm approach |
| `@plussub/srt-vtt-parser` | ^2.0.5 | Parse uploaded SRT/VTT files | Zero dependencies, TypeScript, handles both formats, clean output `{from, to, text, id}` |
| `react-youtube` | ^10.1.0 | YouTube iframe embed React component | 460K+ weekly downloads, exposes full YouTube IFrame Player API via event.target, onReady/onStateChange/onPlay/onPause/onEnd events |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | (already installed) | Validate YouTube URL input, caption upload payloads | All API route input validation |
| `drizzle-orm` | (already installed) | Video sessions and captions schema | Database schema and queries |
| `use-debounce` | (already installed) | Debounce URL input before extraction | URL input UX |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `youtube-transcript` | `youtube-caption-extractor` | More features (video details, dual extraction methods) but no track listing ability, less battle-tested |
| `youtube-transcript` | `@playzone/youtube-transcript` | Newer, proxy support, but less community adoption |
| `react-youtube` | Raw `<iframe>` + YouTube IFrame API | No dependency, but manual setup for React lifecycle, event cleanup, SSR handling |
| `react-youtube` | `react-lite-youtube-embed` | Better performance (lazy-loads player) but does NOT expose programmatic playback control (seekTo, getCurrentTime) needed for Phase 51-54 |
| `@plussub/srt-vtt-parser` | `subtitle` (npm) | Stream-based, more features, but heavier and stream API unnecessary for file upload parsing |
| Per-row captions | Single JSONB column | Simpler schema, but makes per-line queries (transcript sync, loop mode, vocabulary tracking) inefficient |

**Installation:**
```bash
npm install youtube-transcript @plussub/srt-vtt-parser react-youtube
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── db/schema/
│   └── video.ts              # videoSessions, videoCaptions tables
├── app/
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       └── listening/     # Video Listening Lab page
│   │           ├── page.tsx   # Server component (auth guard, initial data)
│   │           └── ListeningClient.tsx  # Client component (player, URL input, caption status)
│   └── api/
│       └── video/
│           ├── extract-captions/
│           │   └── route.ts   # POST: extract YouTube captions (server-side)
│           └── upload-captions/
│               └── route.ts   # POST: parse uploaded SRT/VTT file
├── lib/
│   └── youtube.ts             # YouTube URL parsing, video ID extraction
└── components/
    └── video/
        ├── YouTubePlayer.tsx  # react-youtube wrapper with consistent props
        ├── UrlInput.tsx       # YouTube URL input with validation
        └── CaptionStatus.tsx  # Caption availability indicator
```

### Pattern 1: Server-Side Caption Extraction (Server Action / API Route)
**What:** Caption extraction runs server-side only. The `youtube-transcript` package scrapes YouTube's HTML, which requires server-side execution (no browser sandbox). Expose as a POST API route.
**When to use:** Every time a student submits a YouTube URL.
**Example:**
```typescript
// src/app/api/video/extract-captions/route.ts
import { YoutubeTranscript } from "youtube-transcript";

// Try Chinese language codes in priority order
const CHINESE_LANG_CODES = ["zh", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW"];

export async function POST(request: NextRequest) {
  const { videoId } = await request.json();

  for (const lang of CHINESE_LANG_CODES) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      // transcript: Array<{ text: string, duration: number, offset: number, lang: string }>
      return NextResponse.json({ captions: transcript, lang });
    } catch (error) {
      if (error.message?.includes("language")) continue; // try next language code
      throw error;
    }
  }

  return NextResponse.json({ captions: null, error: "no_chinese_captions" });
}
```

### Pattern 2: Normalized Caption Storage
**What:** Both YouTube-extracted captions and uploaded SRT/VTT captions are stored in the same `video_captions` table with identical columns (`start_ms`, `end_ms`, `text`, `sequence`). The source is tracked via a `source` enum (`youtube_auto`, `youtube_manual`, `upload_srt`, `upload_vtt`).
**When to use:** Always. This normalization enables all downstream features (transcript sync, loop mode, vocabulary tracking) to work identically regardless of caption source.
**Example:**
```typescript
// Normalized caption from YouTube transcript
{
  videoSessionId: "uuid",
  sequence: 1,
  startMs: 1500,     // offset in ms
  endMs: 4200,       // offset + duration in ms
  text: "你好世界",
  source: "youtube_auto"
}

// Normalized caption from SRT upload (same shape)
{
  videoSessionId: "uuid",
  sequence: 1,
  startMs: 1500,     // from parsed SRT
  endMs: 4200,       // to parsed SRT
  text: "你好世界",
  source: "upload_srt"
}
```

### Pattern 3: YouTube URL Validation and Video ID Extraction
**What:** Extract the 11-character YouTube video ID from various URL formats (youtube.com/watch, youtu.be, youtube.com/embed, youtube.com/shorts).
**When to use:** Client-side validation before submission, server-side validation before extraction.
**Example:**
```typescript
// src/lib/youtube.ts
const YT_REGEX = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractVideoId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match?.[1] ?? null;
}

// Zod schema for URL validation
export const youtubeUrlSchema = z.string()
  .min(1, "URL is required")
  .refine((url) => extractVideoId(url) !== null, {
    message: "Invalid YouTube URL",
  });
```

### Pattern 4: CSP Configuration for YouTube Embeds
**What:** The existing `next.config.ts` CSP blocks YouTube iframes. Must add YouTube domains to `frame-src` and `img-src` (for thumbnails).
**When to use:** Before any YouTube embed can render.
**Example:**
```typescript
// next.config.ts - CSP updates needed:
// frame-src: add https://www.youtube.com https://www.youtube-nocookie.com
// img-src: add https://i.ytimg.com (YouTube thumbnails)
```

### Anti-Patterns to Avoid
- **Client-side caption extraction:** `youtube-transcript` scrapes YouTube HTML and will fail in the browser due to CORS. Always run server-side.
- **Storing captions as a single JSON blob:** Makes per-line queries impossible. Use individual rows.
- **Using YouTube Data API v3 for caption extraction:** Requires API key, has quota limits (50 units per captions.list, 200 per captions.download, 10K daily limit), and captions.download requires the video owner to have granted access. The unofficial scraping approach is more practical for this use case.
- **Using `react-lite-youtube-embed` for the player:** It optimizes initial load but does NOT expose the YouTube IFrame Player API for programmatic control. Phases 51-54 need `seekTo`, `getCurrentTime`, `getDuration`, `setPlaybackRate`.
- **Hardcoding a single Chinese language code:** YouTube videos may use `zh`, `zh-Hans`, `zh-Hant`, `zh-CN`, or `zh-TW`. Must try multiple codes.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YouTube caption scraping | Custom HTML parser for YouTube transcript | `youtube-transcript` | YouTube's page structure changes frequently; library maintainers track these changes |
| SRT/VTT timestamp parsing | Custom regex for "HH:MM:SS,mmm --> HH:MM:SS,mmm" | `@plussub/srt-vtt-parser` | SRT has edge cases (multiline text, HTML tags, encoding variants), VTT has STYLE/NOTE blocks |
| YouTube iframe lifecycle | Manual `<script>` injection + `YT.Player` construction | `react-youtube` | Handles script loading, cleanup, re-renders, event binding in React lifecycle |
| YouTube URL parsing | Simple string split | Regex covering all URL formats | YouTube has 5+ URL formats (watch, short, embed, youtu.be, shorts, nocookie) |
| Encoding detection for uploaded files | Manual charset sniffing | `jschardet` (already installed) | Chinese subtitle files may be GB2312, GBK, Big5, or UTF-8. Existing reader import route already demonstrates this pattern |

**Key insight:** The caption extraction ecosystem is built on unofficial YouTube APIs that change without notice. Using maintained community packages means getting fixes when YouTube changes its HTML structure, rather than debugging it yourself.

## Common Pitfalls

### Pitfall 1: CSP Blocks YouTube Iframe
**What goes wrong:** YouTube iframe embed renders as blank/broken. Browser console shows CSP violation for `frame-src`.
**Why it happens:** The project's `next.config.ts` CSP currently only allows `frame-src https://challenges.cloudflare.com`. YouTube iframes require `www.youtube.com` and `www.youtube-nocookie.com`.
**How to avoid:** Update CSP `frame-src` before implementing the player. Also add `https://i.ytimg.com` to `img-src` for thumbnails.
**Warning signs:** Blank iframe area, CSP violation errors in browser console.

### Pitfall 2: Chinese Caption Language Code Mismatch
**What goes wrong:** Caption extraction returns empty/null even though the video has Chinese captions.
**Why it happens:** YouTube videos use inconsistent language codes for Chinese (`zh`, `zh-Hans`, `zh-Hant`, `zh-CN`, `zh-TW`). Requesting the wrong code returns nothing.
**How to avoid:** Try multiple Chinese language codes in priority order. The `youtube-transcript` package throws `YoutubeTranscriptNotAvailableLanguageError` which includes the available language codes -- catch this and check if any match Chinese.
**Warning signs:** Extraction "succeeds" but returns English or no captions.

### Pitfall 3: SRT/VTT Encoding Issues
**What goes wrong:** Uploaded Chinese subtitle files display as garbled characters (mojibake).
**Why it happens:** Chinese SRT files from the wild are often encoded in GB2312, GBK, or Big5, not UTF-8. There is no standard encoding for SRT files.
**How to avoid:** Use `jschardet` for encoding detection before parsing (same pattern as the existing reader import route at `src/app/api/reader/import/route.ts`). Decode with detected encoding, then parse.
**Warning signs:** Output contains `???` or garbled characters instead of Chinese.

### Pitfall 4: YouTube Transcript Rate Limiting
**What goes wrong:** Caption extraction starts failing with captcha/throttle errors for all users.
**Why it happens:** `youtube-transcript` scrapes YouTube HTML. Too many requests from the same server IP triggers YouTube's anti-bot measures.
**How to avoid:** Cache extracted captions in the database. Never re-extract for the same video ID + language. Add rate limiting to the extraction endpoint (already have `@upstash/ratelimit` installed).
**Warning signs:** `YoutubeTranscriptTooManyRequestError` thrown by the library.

### Pitfall 5: Missing YouTube Captions
**What goes wrong:** Many YouTube videos don't have Chinese captions at all, or only have auto-generated ones that are low quality.
**Why it happens:** Captions are optional on YouTube. Auto-generated Chinese captions have significantly lower accuracy than English ones.
**How to avoid:** Design the UX to gracefully handle "no captions found" with a clear fallback to manual upload. Don't make caption extraction feel like a failure -- make manual upload feel like a natural alternative path.
**Warning signs:** Students repeatedly see "no captions" without understanding they can upload their own.

### Pitfall 6: react-youtube in Server Components
**What goes wrong:** Build error or hydration mismatch.
**Why it happens:** `react-youtube` renders a `<div>` and injects the YouTube IFrame Player API script. It requires browser APIs and must be a client component.
**How to avoid:** Always use `"use client"` directive on components that render `<YouTube />`. The page can be a server component that passes data to a client component (same pattern as Reader page).
**Warning signs:** "window is not defined" error during SSR, hydration warnings.

## Code Examples

Verified patterns from official sources and existing codebase:

### Caption Extraction with Language Fallback
```typescript
// Source: youtube-transcript npm package API + codebase pattern
import { YoutubeTranscript } from "youtube-transcript";

interface ExtractedCaption {
  text: string;
  startMs: number;
  endMs: number;
}

const CHINESE_LANGS = ["zh", "zh-Hans", "zh-Hant", "zh-CN", "zh-TW"];

export async function extractChineseCaptions(
  videoId: string
): Promise<{ captions: ExtractedCaption[]; lang: string } | null> {
  for (const lang of CHINESE_LANGS) {
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang });
      const captions = transcript.map((item, idx) => ({
        text: item.text,
        startMs: Math.round(item.offset),
        endMs: Math.round(item.offset + item.duration),
      }));
      return { captions, lang };
    } catch (error: unknown) {
      // YoutubeTranscriptNotAvailableLanguageError means this lang code not available
      // Continue to next code
      const message = error instanceof Error ? error.message : "";
      if (message.includes("language") || message.includes("available")) {
        continue;
      }
      // Other errors (video unavailable, disabled, etc.) should propagate
      throw error;
    }
  }
  return null;
}
```

### SRT/VTT Parse with Encoding Detection
```typescript
// Source: @plussub/srt-vtt-parser API + existing reader import pattern
import { parse } from "@plussub/srt-vtt-parser";
import { detect } from "jschardet";

interface ParsedCaption {
  text: string;
  startMs: number;
  endMs: number;
  sequence: number;
}

export function parseCaptionFile(buffer: Buffer, fileName: string): ParsedCaption[] {
  // Detect encoding (same pattern as src/app/api/reader/import/route.ts)
  let text = new TextDecoder("utf-8").decode(buffer);
  const CJK_REGEX = /[\u4e00-\u9fff]/;

  if (!CJK_REGEX.test(text)) {
    const detection = detect(buffer);
    if (detection.encoding && detection.confidence >= 0.5) {
      const encoding = ENCODING_MAP[detection.encoding] ?? detection.encoding.toLowerCase();
      if (encoding !== "utf-8") {
        try {
          text = new TextDecoder(encoding).decode(buffer);
        } catch {
          // Fall back to UTF-8
        }
      }
    }
  }

  const { entries } = parse(text);
  return entries.map((entry, idx) => ({
    text: entry.text.replace(/<[^>]*>/g, "").trim(), // Strip HTML tags
    startMs: entry.from,
    endMs: entry.to,
    sequence: idx + 1,
  }));
}
```

### YouTube Player Component (Client-Side)
```typescript
// Source: react-youtube API + YouTube IFrame Player API
"use client";

import YouTube, { type YouTubeEvent } from "react-youtube";
import { useCallback, useRef } from "react";

interface YouTubePlayerProps {
  videoId: string;
  onReady?: (player: YT.Player) => void;
}

export function YouTubePlayer({ videoId, onReady }: YouTubePlayerProps) {
  const playerRef = useRef<YT.Player | null>(null);

  const handleReady = useCallback((event: YouTubeEvent) => {
    playerRef.current = event.target;
    onReady?.(event.target);
  }, [onReady]);

  return (
    <div className="w-full aspect-video">
      <YouTube
        videoId={videoId}
        className="w-full h-full"
        iframeClassName="w-full h-full rounded-lg"
        opts={{
          playerVars: {
            autoplay: 0,
            modestbranding: 1,
            rel: 0,
            cc_load_policy: 0, // Don't show YouTube's own captions (we render our own)
          },
        }}
        onReady={handleReady}
      />
    </div>
  );
}
```

### Database Schema Pattern (Following Project Conventions)
```typescript
// Source: existing schema files (vocabulary.ts, progress.ts, practice.ts)
import {
  pgTable, uuid, varchar, text, integer,
  timestamp, pgEnum, unique, index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const captionSourceEnum = pgEnum("caption_source", [
  "youtube_auto",
  "youtube_manual",
  "upload_srt",
  "upload_vtt",
]);

export const videoSessions = pgTable("video_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  youtubeVideoId: varchar("youtube_video_id", { length: 11 }).notNull(),
  youtubeUrl: text("youtube_url").notNull(),
  title: text("title"),          // extracted from YouTube or user-provided
  captionSource: captionSourceEnum("caption_source"),
  captionLang: varchar("caption_lang", { length: 10 }), // e.g. "zh-Hans"
  captionCount: integer("caption_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("video_sessions_user_id_idx").on(table.userId),
  index("video_sessions_youtube_video_id_idx").on(table.youtubeVideoId),
  unique("video_sessions_user_video_unique").on(table.userId, table.youtubeVideoId),
]);

export const videoCaptions = pgTable("video_captions", {
  id: uuid("id").defaultRandom().primaryKey(),
  videoSessionId: uuid("video_session_id")
    .notNull()
    .references(() => videoSessions.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  startMs: integer("start_ms").notNull(),
  endMs: integer("end_ms").notNull(),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("video_captions_session_idx").on(table.videoSessionId),
  index("video_captions_session_seq_idx").on(table.videoSessionId, table.sequence),
]);
```

### YouTube URL Validation
```typescript
// Source: community regex patterns, verified against YouTube URL formats
import { z } from "zod";

const YT_REGEX = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractVideoId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match?.[1] ?? null;
}

export const youtubeUrlSchema = z.string()
  .min(1, "Please enter a YouTube URL")
  .refine((url) => extractVideoId(url) !== null, {
    message: "Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...)",
  });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| YouTube Data API v3 for captions | Unofficial transcript scraping via npm packages | Ongoing since ~2020 | No API key needed, no quota limits, but breaks when YouTube changes HTML |
| `padding-bottom: 56.25%` hack for responsive video | `aspect-ratio: 16/9` CSS property (Tailwind `aspect-video`) | Tailwind 3.0+ (2022) | Cleaner markup, no wrapper div hack |
| `@tailwindcss/aspect-ratio` plugin | Built-in `aspect-video` utility | Tailwind 3.0+ | One fewer plugin dependency |
| Multiple YouTube embed libraries | `react-youtube` as de facto standard | Stable since v10 (2022) | Most downloaded, best YouTube IFrame API exposure |

**Deprecated/outdated:**
- YouTube Data API v3 captions.download: Requires video owner authorization for most videos. Not practical for arbitrary YouTube URLs.
- `subtitle` npm package stream API: Over-engineered for file upload parsing. Use `@plussub/srt-vtt-parser` for simpler use cases.

## Open Questions

1. **`react-youtube` and React 19 peer dependencies**
   - What we know: `react-youtube` v10.1.0 was last published Nov 2022. React 19 introduced peer dependency changes. No open GitHub issues about React 19 incompatibility. The project uses React 19.2.3.
   - What's unclear: Whether `npm install` will show peer dependency warnings. Whether the library works correctly at runtime with React 19.
   - Recommendation: Install and test. If peer dependency issues, use `--legacy-peer-deps` flag or consider a thin custom wrapper around the YouTube IFrame API (the `react-youtube` source is ~200 lines). An `onStateChange` Firefox issue (#414) exists but is not blocking.

2. **YouTube rate limiting threshold**
   - What we know: `youtube-transcript` throws `YoutubeTranscriptTooManyRequestError` when rate limited. No documented threshold.
   - What's unclear: How many requests per minute/hour before YouTube blocks the server IP.
   - Recommendation: Implement aggressive caching from day one. Once captions are extracted for a `youtubeVideoId`, never re-extract. Different users watching the same video should share cached captions. The `unique("video_sessions_user_video_unique")` constraint handles per-user sessions, but caption data for the same video could potentially be shared across users. Consider a separate `video_caption_cache` approach if needed in a later phase.

3. **`video_sessions` uniqueness: per-user or global?**
   - What we know: The schema above uses a per-user unique constraint (`userId + youtubeVideoId`). This means if two students watch the same video, two separate video_sessions rows exist.
   - What's unclear: Whether to share caption data across users (a single "video" entity with shared captions, and user-specific "session" entries) or keep it simple (per-user sessions each with their own caption copies).
   - Recommendation: Start simple with per-user sessions and per-session captions. The data volume is small (typically 50-200 caption rows per video). If sharing becomes important for performance or quota reasons, refactor to a shared `videos` table in a later phase.

## Sources

### Primary (HIGH confidence)
- `youtube-transcript` GitHub source code (`src/index.ts`) - TranscriptConfig interface, language selection, error types. URL: https://github.com/Kakulukian/youtube-transcript
- `@plussub/srt-vtt-parser` GitHub README - API (`parse` function), output format (`{from, to, text, id}`). URL: https://github.com/plussub/srt-vtt-parser
- `react-youtube` GitHub README - Props, events, YouTube IFrame API access via event.target. URL: https://github.com/tjallingt/react-youtube
- YouTube IFrame Player API reference (Google official). URL: https://developers.google.com/youtube/iframe_api_reference
- Drizzle ORM docs (Context7, library ID: `/llmstxt/orm_drizzle_team_llms_txt`) - pgTable schema patterns, relations, type inference
- Existing codebase: `src/db/schema/vocabulary.ts`, `src/db/schema/progress.ts`, `src/app/api/reader/import/route.ts` (upload + encoding detection pattern), `next.config.ts` (CSP)

### Secondary (MEDIUM confidence)
- YouTube CSP configuration requirements - Multiple web sources confirm `frame-src www.youtube.com www.youtube-nocookie.com` and `img-src i.ytimg.com`. URL: https://jloh.co/posts/youtube-csp/
- YouTube Chinese language codes (`zh`, `zh-Hans`, `zh-Hant`, `zh-CN`, `zh-TW`) - Multiple sources including YouTube transcript API docs. URL: https://docs.supadata.ai/youtube/supported-language-codes
- react-youtube weekly downloads (~460K) and React 19 status - npm trends and Socket.dev. URLs: https://npmtrends.com/react-youtube, https://socket.dev/npm/package/react-youtube

### Tertiary (LOW confidence)
- YouTube rate limiting thresholds for transcript scraping - No official documentation exists. Based on community reports only.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All recommended libraries are well-established npm packages with TypeScript support. Verified via GitHub source, READMEs, and npm stats.
- Architecture: HIGH - Schema design follows existing codebase patterns exactly (uuid PKs, user FK with cascade, timestamps, indexes). API route pattern matches existing reader import route.
- Pitfalls: HIGH - CSP issue verified by reading actual `next.config.ts`. Encoding issues verified by existing reader import code. Language code variation verified by YouTube API docs.
- react-youtube + React 19: MEDIUM - No reported issues found, but the library hasn't been updated in 3+ years. Runtime testing recommended.

**Research date:** 2026-02-09
**Valid until:** 2026-03-09 (30 days - stable domain, npm packages unlikely to change significantly)
