---
phase: 50-video-foundation
plan: 01
subsystem: video-foundation
tags: [schema, youtube, components, csp]
dependency_graph:
  requires: []
  provides: [videoSessions-table, videoCaptions-table, extractVideoId, YouTubePlayer, UrlInput, youtube-csp]
  affects: [50-02-caption-extraction, 50-03-page-assembly]
tech_stack:
  added: [react-youtube, youtube-transcript, "@plussub/srt-vtt-parser"]
  patterns: [drizzle-pgTable, zod-refinement, react-youtube-embed]
key_files:
  created:
    - src/db/schema/video.ts
    - src/lib/youtube.ts
    - src/components/video/YouTubePlayer.tsx
    - src/components/video/UrlInput.tsx
    - src/db/migrations/0012_eager_hiroim.sql
  modified:
    - src/db/schema/index.ts
    - next.config.ts
    - package.json
decisions:
  - decision: "Use react-youtube with --legacy-peer-deps for React 19 compat"
    rationale: "Library works fine with React 19, only peer dep warning"
    outcome: "good"
metrics:
  duration: "5m 41s"
  completed: "2026-02-09"
---

# Phase 50 Plan 01: Video Foundation Schema and Components Summary

Database schema for video sessions/captions, YouTube URL parser, embed player, and URL input component with CSP updates.

## What Was Built

### Task 1: Video Schema and Dependencies (cc95fd0)

Created `src/db/schema/video.ts` with two tables:

**videoSessions** - Tracks user video listening sessions:
- UUID primary key, userId FK to users with cascade delete
- youtubeVideoId (varchar 11), youtubeUrl, title (nullable)
- captionSource enum (youtube_auto, youtube_manual, upload_srt, upload_vtt)
- captionLang, captionCount, timestamps with $onUpdate
- Indexes on userId, youtubeVideoId; unique constraint on userId+youtubeVideoId

**videoCaptions** - Stores individual caption lines:
- UUID primary key, videoSessionId FK with cascade delete
- sequence, startMs, endMs (all integers), text
- Indexes on videoSessionId and composite (videoSessionId, sequence)

Relations defined for both tables. Type exports: VideoSession, NewVideoSession, VideoCaption, NewVideoCaption.

Installed: react-youtube, youtube-transcript, @plussub/srt-vtt-parser.
Generated migration 0012_eager_hiroim.sql.

### Task 2: YouTube Utilities, Components, and CSP (6f83cb9)

**src/lib/youtube.ts** - URL parsing utility:
- `extractVideoId(url)` - Regex-based extraction supporting 7+ YouTube URL formats (watch, youtu.be, embed, shorts, nocookie, v/)
- `youtubeUrlSchema` - Zod schema with refinement validation
- All 9 test cases pass (7 valid formats + 2 invalid URLs)

**src/components/video/YouTubePlayer.tsx** - YouTube embed component:
- Wraps react-youtube with aspect-video container
- Props: videoId, onReady callback (exposes YTPlayer), className
- Player options: autoplay off, modestbranding, no related videos, no built-in captions

**src/components/video/UrlInput.tsx** - URL input form:
- Validates via extractVideoId before calling onSubmit
- Uses shadcn Input and Button components
- Shows validation errors, supports isLoading state
- Clears error on input change

**next.config.ts** - CSP updates:
- frame-src: added youtube.com and youtube-nocookie.com
- img-src: added i.ytimg.com for thumbnails

## Deviations from Plan

### Note: Database Migration Not Applied

Migration 0012 was generated but not applied (DATABASE_URL not available in build environment). The migration file exists and will be applied on next deployment or when `npm run db:migrate` is run with database credentials.

No other deviations. Plan executed as written.

## Verification Results

- `npm run db:generate` - PASSED (migration 0012 generated with correct SQL)
- Schema barrel export - PASSED (videoSessions, videoCaptions importable)
- URL extraction tests - PASSED (9/9 formats correct)
- `npm run build` - PASSED (no TypeScript errors, all pages compiled)
- CSP includes youtube.com in frame-src and i.ytimg.com in img-src - PASSED

## Self-Check: PASSED

- src/db/schema/video.ts: FOUND
- src/lib/youtube.ts: FOUND
- src/components/video/YouTubePlayer.tsx: FOUND
- src/components/video/UrlInput.tsx: FOUND
- Commits with "50-01": 2 found (cc95fd0, 6f83cb9)
