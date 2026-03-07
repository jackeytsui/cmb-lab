---
phase: 33-practice-set-player
plan: 02
subsystem: practice-api
tags: [api, rest, n8n, grading, attempts, practice]
depends_on:
  requires: ["32 (practice schema)"]
  provides: ["Practice attempt CRUD API", "AI grading delegation for practice exercises"]
  affects: ["33-03 (renderers need grade endpoint)", "33-06 (player page uses attempts API)"]
tech-stack:
  added: []
  patterns: ["Content-Type branching for JSON/FormData", "n8n webhook delegation with mock fallback", "interactionId reuse for n8n compatibility"]
key-files:
  created:
    - src/app/api/practice/[setId]/attempts/route.ts
    - src/app/api/practice/grade/route.ts
  modified: []
decisions:
  - "Reuse interactionId field name in n8n payload to avoid modifying existing n8n workflow"
  - "Content-Type header detection branches grade route between JSON (free_text) and FormData (audio_recording)"
  - "Practice grade route does NOT capture to submissions table; attempts API handles persistence separately"
  - "Mock fallback returns GradeResult-shaped response when N8N webhook URLs not configured"
metrics:
  duration: "~6 min"
  completed: "2026-02-07"
---

# Phase 33 Plan 02: Practice API Routes Summary

**One-liner:** Attempt CRUD (POST/GET) and AI grading delegation (free_text + audio) via n8n webhooks with mock fallback

## What Was Built

### Task 1: Practice Attempt API Route (POST + GET)
**File:** `src/app/api/practice/[setId]/attempts/route.ts`

- **POST** creates a new attempt record or updates an existing one (via `attemptId` field)
  - Insert path: validates `totalExercises >= 1`, returns 201
  - Update path: matches on `attemptId` + `userId` ownership, returns 200
  - Stores JSONB `results` keyed by exercise ID
- **GET** returns the current user's attempts for a practice set, ordered by `startedAt` DESC
- Both handlers: Clerk auth, internal user ID lookup, rate limiting via `gradingLimiter`

### Task 2: Practice Grade API Route
**File:** `src/app/api/practice/grade/route.ts`

- Single POST handler that branches on `Content-Type` header:
  - `application/json` -> free_text grading via `N8N_GRADING_WEBHOOK_URL`
  - `multipart/form-data` -> audio_recording grading via `N8N_AUDIO_GRADING_WEBHOOK_URL`
- **Free text flow:** Parses `exerciseId`, `studentResponse`, `definition` from JSON; loads prompt from DB; builds n8n payload with `interactionId: exerciseId`; maps `GradingResponse` to `GradeResult`
- **Audio flow:** Parses `audio` File, `exerciseId`, `targetPhrase`, `language` from FormData; builds n8n FormData payload; maps `AudioGradingResponse` to `GradeResult`
- Mock fallback when webhook URLs not configured (returns `{ isCorrect: true, score: 85 }`)
- 15-second timeout on n8n calls with proper AbortController cleanup
- Does NOT capture to submissions table (practice attempts stored separately)

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Reuse `interactionId` field name in n8n payload | Avoids modifying existing n8n workflow; field is used for logging, not LMS lookups |
| Content-Type branching in single grade endpoint | Simpler client API (one URL for all AI-graded exercises) vs separate text/audio routes |
| No submissions table capture | Practice has its own persistence via attempts API; avoids polluting coach review with practice data |
| Mock GradeResult fallback | Enables UI development and testing without n8n infrastructure |

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 77278d7 | feat(33-02): create practice attempt API route (POST + GET) |
| 2 | abbe1d7 | feat(33-02): create practice grade API route for AI exercises |

## Verification

- `npx tsc --noEmit` passes with zero errors for both route files
- Both routes export POST handler; attempts route also exports GET
- Rate limiting applied to all endpoints
- No new dependencies added

## Deviations from Plan

None -- plan executed exactly as written. The attempts route file already existed (created during earlier session) and matched the plan specification exactly, so it was committed as-is.

## Next Phase Readiness

- Attempts API ready for the practice set player (Plan 06) to persist results
- Grade endpoint ready for FreeTextRenderer and AudioRecordingRenderer (Plan 03/05) to delegate AI grading
- No blockers for downstream plans

## Self-Check: PASSED
