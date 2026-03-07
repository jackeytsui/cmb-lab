---
phase: 16-search
plan: 01
subsystem: database
tags: [pinyin, jyutping, romanization, search, drizzle, chinese]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: courses and lessons tables in Drizzle schema
provides:
  - searchPinyin and searchJyutping columns on courses and lessons tables
  - sanitizeSearchQuery and generateSearchFields utility functions
  - pinyin-pro, to-jyutping, use-debounce npm packages
affects: [16-02 search API, 16-03 search UI, content creation/edit flows]

# Tech tracking
tech-stack:
  added: [pinyin-pro, to-jyutping, use-debounce]
  patterns: [pre-computed romanization columns for Chinese search]

key-files:
  created:
    - src/lib/search-utils.ts
    - src/db/migrations/0003_demonic_flatman.sql
  modified:
    - src/db/schema/courses.ts
    - package.json

key-decisions:
  - "Applied migration via direct SQL (ALTER TABLE IF NOT EXISTS) since db:migrate fails on shared Neon database with pre-existing untracked migrations"
  - "Chinese character extraction via regex /[\\u4e00-\\u9fff]/g before romanization conversion"
  - "Both pinyin and jyutping stored without tones for broader search matching"

patterns-established:
  - "Pre-computed romanization: generate search fields at write time, not query time"
  - "sanitizeSearchQuery for SQL ILIKE pattern safety (escape % and _)"

# Metrics
duration: 7min
completed: 2026-01-30
---

# Phase 16 Plan 01: Search Infrastructure Summary

**Romanization search columns (pinyin/jyutping) on courses and lessons, with pinyin-pro and to-jyutping utilities for Chinese-aware search**

## Performance

- **Duration:** 7 min
- **Started:** 2026-01-30T10:42:38Z
- **Completed:** 2026-01-30T10:49:10Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added searchPinyin and searchJyutping text columns to both courses and lessons tables
- Installed pinyin-pro, to-jyutping, and use-debounce npm packages
- Created search-utils.ts with sanitizeSearchQuery and generateSearchFields functions
- Generated Drizzle migration 0003 and applied schema changes to Neon database

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and add schema columns** - `fce05ab` (feat)
2. **Task 2: Create search utilities and generate migration** - `0f4156e` (feat)

## Files Created/Modified
- `src/db/schema/courses.ts` - Added searchPinyin and searchJyutping columns to courses and lessons tables
- `src/lib/search-utils.ts` - sanitizeSearchQuery and generateSearchFields utility functions
- `src/db/migrations/0003_demonic_flatman.sql` - ALTER TABLE migration for search columns
- `src/db/migrations/meta/_journal.json` - Updated migration journal
- `src/db/migrations/meta/0002_snapshot.json` - Previously untracked snapshot
- `src/db/migrations/meta/0003_snapshot.json` - New migration snapshot
- `package.json` - Added pinyin-pro, to-jyutping, use-debounce dependencies

## Decisions Made
- Applied migration via direct SQL (ALTER TABLE IF NOT EXISTS) instead of `db:migrate` because the Neon database has pre-existing tables from other projects that cause migration 0002 to fail (tries to CREATE TYPE that already exists). The `db:push` command also fails as it tries to rename unrelated tables. Direct SQL with IF NOT EXISTS is the safest approach.
- Chinese characters extracted via regex before romanization to avoid processing non-Chinese text
- Both pinyin and jyutping stored without tone marks/numbers for broader substring matching

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration applied via direct SQL instead of db:migrate**
- **Found during:** Task 2 (Generate and run migration)
- **Issue:** `npm run db:migrate` fails because migration 0002 was never tracked in `__drizzle_migrations` table (schema was applied via `db:push`), causing it to replay all migrations including CREATE TYPE statements that already exist
- **Fix:** Applied the 4 ALTER TABLE statements directly using `@neondatabase/serverless` with IF NOT EXISTS
- **Files modified:** No file changes needed, database updated directly
- **Verification:** Queried information_schema.columns confirming all 4 columns exist
- **Committed in:** 0f4156e (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration applied correctly via alternative method. Schema state matches plan exactly.

## Issues Encountered
- Drizzle migration tracking table (`__drizzle_migrations`) does not exist in the Neon database, indicating all previous schema changes were applied via `db:push`. Future migrations will need the same direct-SQL approach unless the tracking table is initialized.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Search columns ready for Plan 02 (search API with ILIKE queries against romanization columns)
- generateSearchFields utility ready for use in content creation/edit flows
- use-debounce package ready for Plan 03 (search UI)

---
*Phase: 16-search*
*Completed: 2026-01-30*
