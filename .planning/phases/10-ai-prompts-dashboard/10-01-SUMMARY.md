---
phase: 10-ai-prompts-dashboard
plan: 01
subsystem: database
tags: [drizzle, postgres, prompts, versioning]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users table for createdBy foreign key
provides:
  - aiPrompts table with slug, name, type, currentContent, currentVersion
  - aiPromptVersions table with version history
  - promptTypeEnum (grading_text, grading_audio, voice_ai, chatbot)
  - Initial voice AI prompts seeded
affects: [10-02, 10-03, 10-04, voice-ai-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Version history with current content in main table and full history in versions table
    - Fixed UUIDs for idempotent seeding of reference data

key-files:
  created:
    - src/db/schema/prompts.ts
    - src/db/migrations/0001_huge_husk.sql
  modified:
    - src/db/schema/index.ts
    - src/db/seed.ts

key-decisions:
  - "Version 1 stored both in aiPrompts.currentContent and aiPromptVersions.content for immediate access and history"
  - "Fixed UUIDs for seed prompts to allow idempotent re-seeding"
  - "createdBy nullable on aiPromptVersions for seed data (no user context during seeding)"
  - "Cascade delete from aiPrompts to aiPromptVersions for cleanup"

patterns-established:
  - "Prompt versioning: currentVersion integer + separate versions table with full content"
  - "Template placeholders use {{variableName}} syntax for lesson context"

# Metrics
duration: 7min
completed: 2026-01-28
---

# Phase 10 Plan 01: Database Schema for AI Prompts Summary

**aiPrompts and aiPromptVersions tables with promptTypeEnum, seed data for voice AI tutor prompts**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-28T05:28:07Z
- **Completed:** 2026-01-28T05:35:36Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Created aiPrompts table with slug, name, type, currentContent, currentVersion columns
- Created aiPromptVersions table with promptId FK (cascade delete), version, content, changeNote, createdBy FK
- Added promptTypeEnum with all four values (grading_text, grading_audio, voice_ai, chatbot)
- Seeded 2 initial voice AI prompts with version 1 records
- Applied migration to Neon database

## Task Commits

Each task was committed atomically:

1. **Task 1: Create prompts schema with version history tables** - `8e96e0a` (feat)
2. **Task 2: Add initial prompts to seed script** - `499bfed` (feat)
3. **Task 3: Run migration and seed on Neon database** - `dfcce17` (chore)

## Files Created/Modified

- `src/db/schema/prompts.ts` - aiPrompts and aiPromptVersions tables with relations
- `src/db/schema/index.ts` - Re-exports prompts schema
- `src/db/seed.ts` - Added seedPrompts() with voice AI tutor prompts
- `src/db/migrations/0001_huge_husk.sql` - Generated migration including prompts tables
- `src/db/migrations/meta/_journal.json` - Drizzle migration journal
- `src/db/migrations/meta/0001_snapshot.json` - Drizzle schema snapshot

## Decisions Made

- **Version history pattern:** Store currentContent in aiPrompts for fast access, full history in aiPromptVersions for audit/rollback
- **Fixed UUIDs for seeds:** VOICE_TUTOR_SYSTEM_ID and VOICE_TUTOR_LESSON_ID allow repeated db:seed without duplicates
- **Nullable createdBy:** Seed data has no user context, so createdBy is nullable
- **Template placeholders:** Use {{variableName}} syntax (e.g., {{lessonTitle}}, {{vocabulary}}) for lesson context injection

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed database schema mismatches**

- **Found during:** Task 3 (Run migration and seed)
- **Issue:** Database tables missing columns that schema expects (courses.preview_lesson_count, courses.sort_order, courses.deleted_at, modules.deleted_at, lessons.deleted_at, etc.)
- **Fix:** Added missing columns via ALTER TABLE statements before running seed
- **Files modified:** None (database-only changes)
- **Verification:** npm run db:seed completes successfully
- **Committed in:** Not committed (pre-existing migration issue, database-only fix)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Database fix was necessary to unblock seeding. The schema/database mismatch is a pre-existing issue from incomplete migration pushes.

## Issues Encountered

- drizzle-kit push is interactive and requires manual selection, not suitable for automated deployment
- Used direct SQL execution via neon serverless for idempotent migration application
- Pre-existing database schema mismatch required fixing before seed could run (courses/modules/lessons tables missing columns)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Database schema ready for Plan 02 (API routes for prompt CRUD)
- Two initial prompts seeded: voice-tutor-system and voice-tutor-lesson-template
- Version history infrastructure in place for edit tracking and rollback

---
*Phase: 10-ai-prompts-dashboard*
*Completed: 2026-01-28*
