---
phase: 12-knowledge-base
plan: 01
subsystem: database
tags: [postgres, drizzle, knowledge-base, schema, seed, neon]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Users table with clerkId, Drizzle ORM setup, Neon connection
provides:
  - kb_categories table with name, slug, description, sortOrder
  - kb_entries table with title, content, categoryId, status, createdBy
  - kb_file_sources table with filename, mimeType, fileSize, storageKey
  - kb_chunks table with entryId, fileSourceId, content, chunkIndex
  - kbEntryStatusEnum (draft, published)
  - 4 seeded categories (Packages, Coaching, Chinese Help, FAQ)
affects: [12-knowledge-base, 13-ai-chatbot]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Knowledge base schema with categories, entries, file sources, and chunks
    - Direct SQL schema push for KB tables via push-kb-schema.mjs

key-files:
  created:
    - src/db/schema/knowledge.ts
    - scripts/push-kb-schema.mjs
  modified:
    - src/db/schema/index.ts
    - src/db/seed.ts

key-decisions:
  - "Direct SQL push script for KB tables (drizzle-kit push too interactive)"
  - "Fixed UUIDs for KB category seeds (idempotent seeding pattern)"
  - "text type for createdBy/updatedBy referencing users.clerkId (matches uploads.ts pattern)"

patterns-established:
  - "Knowledge base 4-table pattern: categories > entries > file_sources > chunks"

# Metrics
duration: 6min
completed: 2026-01-29
---

# Phase 12 Plan 01: Knowledge Base Schema Summary

**Drizzle schema with 4 KB tables (categories, entries, file sources, chunks), kbEntryStatusEnum, relations, and 4 seeded categories**

## Performance

- **Duration:** 6 min
- **Started:** 2026-01-29T15:34:20Z
- **Completed:** 2026-01-29T15:40:52Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created knowledge base schema with kbCategories, kbEntries, kbFileSources, kbChunks tables
- Defined relations between all KB tables and foreign keys to users table
- Pushed all tables to Neon database via direct SQL script
- Seeded 4 initial categories: Packages & Pricing, Coaching & Support, Chinese Language Help, FAQ

## Task Commits

Each task was committed atomically:

1. **Task 1: Create knowledge base schema** - `d8285a0` (feat)
2. **Task 2: Seed initial KB categories and push schema** - `186335c` (feat)

## Files Created/Modified
- `src/db/schema/knowledge.ts` - KB tables: kbCategories, kbEntries, kbFileSources, kbChunks with relations and type exports
- `src/db/schema/index.ts` - Added knowledge schema re-export
- `src/db/seed.ts` - Added seedKbCategories() with 4 default categories using fixed UUIDs
- `scripts/push-kb-schema.mjs` - Direct SQL push script for KB enum and tables

## Decisions Made
1. **Direct SQL push script** - drizzle-kit push is interactive and hangs in CI/automated environments. Used direct SQL via @neondatabase/serverless (same pattern as push-all-schema.mjs from Phase 4).
2. **Fixed UUIDs for category seeds** - Enables idempotent seeding with onConflictDoNothing pattern.
3. **text type for createdBy/updatedBy** - References users.clerkId (text) following the uploads.ts pattern rather than UUID user id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used direct SQL push instead of drizzle-kit push**
- **Found during:** Task 2 (schema push)
- **Issue:** drizzle-kit push is interactive and hangs waiting for user input when database has existing tables
- **Fix:** Created scripts/push-kb-schema.mjs with tagged template SQL using @neondatabase/serverless
- **Files modified:** scripts/push-kb-schema.mjs
- **Verification:** All 4 KB tables created and verified in Neon
- **Committed in:** 186335c (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary workaround for known drizzle-kit push limitation. No scope creep.

## Issues Encountered
- drizzle-kit push hangs on "Pulling schema from database..." spinner indefinitely - resolved by using direct SQL push script (known issue from Phase 4)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- KB schema deployed and ready for API routes (Plan 02)
- Categories seeded for immediate use in entry creation
- Chunk table ready for RAG retrieval in Phase 13 (AI Chatbot)

---
*Phase: 12-knowledge-base*
*Completed: 2026-01-29*
