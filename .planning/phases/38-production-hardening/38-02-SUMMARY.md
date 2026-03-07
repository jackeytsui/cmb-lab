---
phase: 38-production-hardening
plan: 02
subsystem: database
tags: [postgres, drizzle, indexes, performance, btree]

# Dependency graph
requires:
  - phase: all prior schema phases (02-06, 13, 16, 19-23, 25, 28, 32-35)
    provides: schema files with foreign key columns
provides:
  - 42 btree indexes on all FK columns across 16 schema files
  - Migration 0008_striped_shotgun.sql ready for manual application
affects: [38-production-hardening, all query-heavy features]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle index pattern: third argument callback returning index array"
    - "Index naming convention: {table_name}_{column_name}_idx"
    - "Skip indexes on columns covered by unique constraints (leading column)"

key-files:
  created:
    - src/db/migrations/0008_striped_shotgun.sql
  modified:
    - src/db/schema/courses.ts
    - src/db/schema/access.ts
    - src/db/schema/interactions.ts
    - src/db/schema/progress.ts
    - src/db/schema/submissions.ts
    - src/db/schema/notes.ts
    - src/db/schema/conversations.ts
    - src/db/schema/prompts.ts
    - src/db/schema/uploads.ts
    - src/db/schema/knowledge.ts
    - src/db/schema/certificates.ts
    - src/db/schema/tags.ts
    - src/db/schema/bulk-operations.ts
    - src/db/schema/filter-presets.ts
    - src/db/schema/practice.ts
    - src/db/schema/chat.ts

key-decisions:
  - "coachFeedback index added in submissions.ts where table is defined, not notes.ts as plan stated"
  - "ghl.ts skipped entirely -- ghlContacts.userId has .unique() implicit index, no other FK columns"
  - "Columns covered by unique constraints (lessonProgress.userId, certificates.userId, studentTags.userId+tagId, coachFeedback.submissionId) did not get redundant indexes"

patterns-established:
  - "All new FK columns must include index declaration in pgTable third argument"
  - "Index naming: {table_name}_{column_name}_idx"

# Metrics
duration: 5min
completed: 2026-02-07
---

# Phase 38 Plan 02: Foreign Key Indexes Summary

**42 btree indexes added across 16 schema files covering all FK columns, with Drizzle migration 0008 ready for manual application**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-07T14:52:53Z
- **Completed:** 2026-02-07T14:58:00Z
- **Tasks:** 2
- **Files modified:** 17 (16 schema files + 1 migration)

## Accomplishments
- Added 42 explicit btree indexes on all foreign key columns lacking unique constraints
- Generated clean migration with 42 CREATE INDEX statements (0008_striped_shotgun.sql)
- Correctly skipped columns already covered by unique constraints (5 columns across 4 tables)
- No duplicate or redundant indexes

## Task Commits

Each task was committed atomically:

1. **Task 1: Add indexes to core content and progress schema files** - `b5e3573` (perf)
2. **Task 2: Add indexes to remaining schema files and generate migration** - `70b4cae` (perf)

## Files Created/Modified
- `src/db/schema/courses.ts` - Indexes on modules.courseId, lessons.moduleId
- `src/db/schema/access.ts` - Indexes on courseAccess.userId, courseAccess.courseId
- `src/db/schema/interactions.ts` - Indexes on interactions.lessonId, interactionAttempts.interactionId/userId
- `src/db/schema/progress.ts` - Index on lessonProgress.lessonId (userId covered by unique)
- `src/db/schema/submissions.ts` - Indexes on submissions.userId/interactionId/lessonId/reviewedBy, coachFeedback.coachId
- `src/db/schema/notes.ts` - Indexes on coachNotes.coachId/studentId/submissionId
- `src/db/schema/conversations.ts` - Indexes on conversations.userId/lessonId, conversationTurns.conversationId
- `src/db/schema/prompts.ts` - Indexes on aiPromptVersions.promptId/createdBy
- `src/db/schema/uploads.ts` - Index on videoUploads.lessonId
- `src/db/schema/knowledge.ts` - Indexes on kbEntries.categoryId, kbFileSources.entryId, kbChunks.entryId/fileSourceId
- `src/db/schema/certificates.ts` - Index on certificates.courseId (userId covered by unique)
- `src/db/schema/tags.ts` - Indexes on tags.createdBy, studentTags.assignedBy, autoTagRules.tagId/createdBy
- `src/db/schema/bulk-operations.ts` - Index on bulkOperations.performedBy
- `src/db/schema/filter-presets.ts` - Index on filterPresets.createdBy
- `src/db/schema/practice.ts` - Indexes on practiceSets.createdBy, practiceExercises.practiceSetId, practiceSetAssignments.practiceSetId/assignedBy, practiceAttempts.practiceSetId/userId
- `src/db/schema/chat.ts` - Indexes on chatConversations.userId/lessonId, chatMessages.conversationId
- `src/db/migrations/0008_striped_shotgun.sql` - Migration with 42 CREATE INDEX statements

## Decisions Made
- coachFeedback table is defined in `submissions.ts`, not `notes.ts` as plan assumed. Index was added in the correct file where the table lives.
- ghl.ts was correctly skipped -- ghlContacts.userId already has `.unique()` which creates an implicit index, and no other FK columns exist in that file.
- 5 columns skipped (no redundant indexes): lessonProgress.userId, certificates.userId, studentTags.userId+tagId, coachFeedback.submissionId, ghlContacts.userId

## Deviations from Plan

None - plan executed exactly as written. The coachFeedback table location (submissions.ts vs notes.ts) was a minor plan description error but the intended index was added correctly.

## Issues Encountered
None

## User Setup Required

**Database migration must be applied manually:**
- Run `npm run db:migrate` to apply migration 0008_striped_shotgun.sql to the Neon database
- This creates 42 btree indexes on FK columns
- Safe to apply on live database (CREATE INDEX is non-blocking for reads)

## Next Phase Readiness
- All FK columns now have indexes, preventing full table scans on JOINs/WHERE
- Migration ready for manual application against Neon
- No blockers for remaining Phase 38 plans

## Self-Check: PASSED

---
*Phase: 38-production-hardening*
*Completed: 2026-02-07*
