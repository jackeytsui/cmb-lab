---
phase: 50-video-foundation
plan: 02
subsystem: api
tags: [captions, youtube-transcript, srt, vtt, encoding-detection, api-routes]
dependency_graph:
  requires:
    - phase: 50-01
      provides: [videoSessions-table, videoCaptions-table, extractVideoId]
  provides: [extract-captions-api, upload-captions-api, extractChineseCaptions, parseCaptionFile, ENCODING_MAP]
  affects: [50-03-page-assembly]
tech_stack:
  added: []
  patterns: [clerk-auth-api-routes, drizzle-upsert, encoding-detection, multi-lang-fallback]
key_files:
  created:
    - src/lib/captions.ts
    - src/app/api/video/extract-captions/route.ts
    - src/app/api/video/upload-captions/route.ts
  modified: []
decisions:
  - decision: "Create video session even when no Chinese captions found"
    rationale: "Allows user to manually upload SRT/VTT after failed auto-extraction"
    outcome: "good"
  - decision: "Return 200 with error key instead of 4xx when no captions available"
    rationale: "Not an error condition -- just no Chinese captions on this video"
    outcome: "good"
patterns_established:
  - "Multi-language fallback: try zh, zh-Hans, zh-Hant, zh-CN, zh-TW in order"
  - "Encoding detection: UTF-8 first, then jschardet with ENCODING_MAP for Chinese encodings"
  - "Caption normalization: NormalizedCaption { text, startMs, endMs, sequence } used everywhere"
metrics:
  duration: "3m 21s"
  completed: "2026-02-09"
---

# Phase 50 Plan 02: Caption Extraction and Upload APIs Summary

YouTube caption extraction with 5 Chinese language code fallbacks, SRT/VTT upload with encoding detection, and shared captions utility library.

## Performance

- **Duration:** 3m 21s
- **Started:** 2026-02-09T05:59:19Z
- **Completed:** 2026-02-09T06:02:40Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- Captions utility library with YouTube extraction (multi-lang fallback) and SRT/VTT parsing (encoding detection)
- Extract-captions API route with session caching to avoid redundant YouTube scraping
- Upload-captions API route with file validation, ownership checks, and caption replacement

## Task Commits

Each task was committed atomically:

1. **Task 1: Create captions utility library** - `a8e6514` (feat)
2. **Task 2: Create extract-captions and upload-captions API routes** - `7631443` (feat)

## Files Created

- `src/lib/captions.ts` - Shared utility: extractChineseCaptions (YouTube transcript with 5 Chinese lang codes), parseCaptionFile (SRT/VTT with encoding detection), NormalizedCaption type, ENCODING_MAP
- `src/app/api/video/extract-captions/route.ts` - POST handler: Clerk auth, videoId validation, session caching (returns cached if captionCount > 0), YouTube extraction, Drizzle upsert on user+video unique constraint, bulk caption insert
- `src/app/api/video/upload-captions/route.ts` - POST handler: Clerk auth, multipart form data, session ownership validation (403), file validation (.srt/.vtt, 2MB max), encoding detection, delete+replace existing captions, session metadata update

## Decisions Made

- **Create session even without captions**: When YouTube has no Chinese captions, an empty session is created so the user can upload SRT/VTT manually without needing to re-submit the URL.
- **Return 200 with error key for no captions**: `{ error: "no_chinese_captions" }` at status 200, since missing captions is an expected outcome (not a client or server error).

## Deviations from Plan

None - plan executed exactly as written. Task 1 was already committed from a previous session.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Routes use existing Clerk auth and Neon database.

## Next Phase Readiness

- Both caption APIs ready for consumption by the listening page (50-03)
- NormalizedCaption format established for all downstream caption display/interaction
- Database migration 0012 (from 50-01) still pending application -- required before routes can function against live database

## Self-Check: PASSED

- src/lib/captions.ts: FOUND
- src/app/api/video/extract-captions/route.ts: FOUND
- src/app/api/video/upload-captions/route.ts: FOUND
- Commit a8e6514: FOUND
- Commit 7631443: FOUND

---
*Phase: 50-video-foundation*
*Completed: 2026-02-09*
