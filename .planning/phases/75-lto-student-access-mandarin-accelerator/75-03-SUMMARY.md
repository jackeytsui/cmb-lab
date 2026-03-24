---
phase: 75-lto-student-access-mandarin-accelerator
plan: 03
subsystem: api, ui, database
tags: [conversation-scripts, dialogue-practice, audio-upload, vercel-blob, self-check]
dependency_graph:
  requires:
    - phase: 75-01
      provides: mandarin_accelerator feature key, accelerator DB tables, FeatureGate support
  provides:
    - Admin CRUD API for conversation scripts with nested dialogue lines
    - Vercel Blob audio upload endpoint for per-line audio files
    - Admin panel for script content management with bulk JSON upload
    - Student script card grid with progress tracking
    - Two-column dialogue practice flow with self-check ratings
    - Script progress API with upsert pattern
  affects: [student-dashboard, accelerator-navigation]
tech_stack:
  added: []
  patterns: [two-column-dialogue-layout, self-check-rating-flow, nested-line-crud]
key_files:
  created:
    - src/app/api/admin/accelerator/scripts/route.ts
    - src/app/api/admin/accelerator/scripts/upload/route.ts
    - src/app/(dashboard)/admin/accelerator/scripts/page.tsx
    - src/app/(dashboard)/admin/accelerator/scripts/AdminScriptsClient.tsx
    - src/app/(dashboard)/dashboard/accelerator/scripts/page.tsx
    - src/app/(dashboard)/dashboard/accelerator/scripts/[scriptId]/page.tsx
    - src/app/(dashboard)/dashboard/accelerator/scripts/[scriptId]/ScriptPracticeClient.tsx
    - src/app/api/accelerator/scripts/progress/route.ts
  modified: []
key_decisions:
  - "Used hasMinimumRole instead of plan's requireMinimumRole (matching existing codebase pattern)"
  - "Amber color for Cantonese, Sky blue for Mandarin to visually distinguish languages at a glance"
  - "Segmented progress bar shows per-line status (green/amber/grey) for at-a-glance review"
patterns_established:
  - "Self-check rating pattern: good/not_good enum with upsert on unique(userId, lineId)"
  - "Dialogue practice flow: one line at a time with audio playback then self-rating then auto-advance"
requirements-completed: [LTO-09, LTO-10, LTO-11, LTO-12]
duration: 393s
completed: 2026-03-24
---

# Phase 75 Plan 03: Conversation Scripts Summary

**Admin CRUD with Vercel Blob audio upload and student two-column dialogue practice flow with Canto-first display, audio playback, and self-check progress tracking.**

## Performance

- **Duration:** 6 min 33s
- **Started:** 2026-03-24T22:43:43Z
- **Completed:** 2026-03-24T22:50:16Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Full admin CRUD API for scripts with nested dialogue lines, bulk JSON upload, and Vercel Blob audio upload
- Student card grid showing all scripts with per-script progress bars
- One-line-at-a-time practice flow with two-column layout (Cantonese first, then Mandarin), audio playback, and self-check ratings
- Progress persistence via upsert API with revisit-not-good-lines capability

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin API and panel for conversation scripts with audio upload** - `7591423` (feat)
2. **Task 2: Student conversation script practice flow with self-check progress** - `0facc7d` (feat)

## Files Created/Modified
- `src/app/api/admin/accelerator/scripts/route.ts` - CRUD API with GET/POST/PUT/DELETE for scripts and nested lines
- `src/app/api/admin/accelerator/scripts/upload/route.ts` - Vercel Blob upload for per-line audio files
- `src/app/(dashboard)/admin/accelerator/scripts/page.tsx` - Admin page with coach role guard
- `src/app/(dashboard)/admin/accelerator/scripts/AdminScriptsClient.tsx` - Client component with expandable cards, create/edit dialog, bulk upload, per-line audio upload
- `src/app/(dashboard)/dashboard/accelerator/scripts/page.tsx` - Student script card grid with progress counts
- `src/app/(dashboard)/dashboard/accelerator/scripts/[scriptId]/page.tsx` - Practice page server component with FeatureGate
- `src/app/(dashboard)/dashboard/accelerator/scripts/[scriptId]/ScriptPracticeClient.tsx` - Two-column dialogue practice UI with audio playback and self-check
- `src/app/api/accelerator/scripts/progress/route.ts` - GET/POST API for self-rating upsert

## Decisions Made
- Used `hasMinimumRole("coach")` from `@/lib/auth` rather than plan's `requireMinimumRole` (which doesn't exist in the codebase)
- Amber color (#f59e0b tones) for Cantonese text and Sky blue for Mandarin text to provide visual language distinction
- Segmented progress bar renders one segment per line with color coding (green=good, amber=not_good, grey=unrated)
- Cherry-picked plan 01 commits into worktree since schema was created by a parallel agent

## Deviations from Plan

None - plan executed exactly as written (minor terminology adjustment for `hasMinimumRole` vs `requireMinimumRole`).

## Issues Encountered
- Plan 01 schema commits were not in this worktree (parallel agent). Cherry-picked 3 commits (a24b475, b4e14ea, 4395636) to bring in the accelerator schema, FeatureGate label, and sidebar updates.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Conversation scripts feature fully functional for admin content management and student practice
- Ready for plan 04 (AI Reader curated passages)
- Audio files require Vercel Blob token (BLOB_READ_WRITE_TOKEN) in production

---
*Phase: 75-lto-student-access-mandarin-accelerator*
*Completed: 2026-03-24*
