---
phase: 44-cleanup-foundation
plan: 02
subsystem: database
tags: [drizzle, postgres, schema, dictionary, vocabulary, migration, chinese-nlp]

# Dependency graph
requires:
  - phase: 44-cleanup-foundation
    provides: "Plan 01 cleaned up stale code and established foundation"
provides:
  - "dictionary_entries table for CC-CEDICT/CC-Canto bilingual word data"
  - "character_data table for per-character radical/stroke/etymology data (Make Me a Hanzi)"
  - "saved_vocabulary table for user word bookmarks"
  - "Migration 0011 SQL ready for Phase 45 seeding"
  - "DictionaryEntry, CharacterData, SavedVocabulary TypeScript types"
affects: [45-dictionary-seeding, 46-reading-ui, 47-dictionary-popup]

# Tech tracking
tech-stack:
  added: []
  patterns: ["natural PK for character_data (varchar(1) instead of uuid)", "text[] array columns with sql default for definitions", "composite index for user+traditional vocabulary lookups"]

key-files:
  created:
    - "src/db/schema/dictionary.ts"
    - "src/db/schema/vocabulary.ts"
    - "src/db/migrations/0011_lazy_wilson_fisk.sql"
  modified:
    - "src/db/schema/index.ts"

key-decisions:
  - "character_data uses varchar(1) natural PK (character IS its identity, always looked up by character)"
  - "definitions stored as text[] PostgreSQL array (not jsonb) for native array operations"
  - "dictionarySourceEnum tracks origin: cedict, canto, or both"
  - "isSingleChar is a boolean populated during seeding (not a generated column)"
  - "Migration 0011 generated but NOT applied (deferred to Phase 45)"

patterns-established:
  - "Natural PK pattern: use varchar PK when entity IS the identifier (e.g., character_data.character)"
  - "text[] array pattern: use sql`'{}'::text[]` as default for PostgreSQL text array columns"

# Metrics
duration: 3min
completed: 2026-02-08
---

# Phase 44 Plan 02: Dictionary & Vocabulary Schema Summary

**Drizzle ORM schema for dictionary_entries (bilingual word data), character_data (radical/stroke/etymology with varchar(1) natural PK), and saved_vocabulary (user bookmarks) with 8 indexes and migration 0011**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-08T09:12:48Z
- **Completed:** 2026-02-08T09:16:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- dictionary_entries table with uuid PK, traditional/simplified/pinyin search indexes, text[] definitions, dictionarySourceEnum, frequencyRank
- character_data table with varchar(1) natural PK (the character itself), radical/stroke/etymology/decomposition fields, jsonb strokePaths/strokeMedians for animation data
- saved_vocabulary table with userId FK to users (cascade delete), composite index on userId+traditional for fast "is this word saved?" lookups
- Migration 0011 generated with 3 CREATE TABLE, 1 CREATE TYPE, 1 FK constraint, 8 CREATE INDEX statements

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dictionary schema (dictionary_entries + character_data)** - `8b4fef8` (feat)
2. **Task 2: Create vocabulary schema and update barrel export** - `867768d` (feat)
3. **Task 3: Generate Drizzle migration for new tables** - `ab74053` (chore)

## Files Created/Modified
- `src/db/schema/dictionary.ts` - dictionaryEntries and characterData table definitions with dictionarySourceEnum, indexes, and type inference exports
- `src/db/schema/vocabulary.ts` - savedVocabulary table with user FK relation, composite index, and type inference exports
- `src/db/schema/index.ts` - Updated barrel export to re-export dictionary and vocabulary modules
- `src/db/migrations/0011_lazy_wilson_fisk.sql` - SQL migration for all 3 tables, enum, FK, and 8 indexes

## Decisions Made
- character_data uses varchar(1) natural PK because the character IS its identity and lookups are always by character (the one exception to the uuid PK codebase convention)
- definitions stored as text[] with `'{}'::text[]` default (native PostgreSQL array, not jsonb) for efficient array operations
- isSingleChar is a regular boolean column populated during seeding (not a generated column) for simplicity
- Migration generated but NOT applied -- deferred to Phase 45 when seeding scripts are ready

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Schema is defined and migration SQL is ready
- Migration 0011 must be applied to Neon before Phase 45 can seed data
- Pending migrations 0007-0011 all need to be applied (accumulated from v5.0 phases)
- DictionaryEntry, CharacterData, SavedVocabulary types available for import from `@/db/schema`

## Self-Check: PASSED

All files verified present. All 3 task commits verified in git log.

---
*Phase: 44-cleanup-foundation*
*Completed: 2026-02-08*
