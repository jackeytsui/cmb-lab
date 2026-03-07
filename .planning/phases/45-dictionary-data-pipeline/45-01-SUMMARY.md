---
phase: 45-dictionary-data-pipeline
plan: 01
subsystem: database
tags: [cc-cedict, cc-canto, make-me-a-hanzi, pinyin-pro, to-jyutping, dictionary, seeding, neon-postgres]

# Dependency graph
requires:
  - phase: 44-cleanup-foundation
    provides: dictionary_entries and character_data table schemas (migration 0011)
provides:
  - "145,896 dictionary_entries rows (cedict/both/canto sources) with pinyinDisplay tone marks and jyutping"
  - "9,574 character_data rows with radical, etymology, stroke paths/medians, and generated jyutping"
  - "Reusable parser library for CC-CEDICT, CC-Canto, and Make Me a Hanzi formats"
  - "Standalone seed script for dictionary data pipeline"
affects: [45-02-dictionary-lookup-api, 46-reader-ui, 47-dictionary-popup]

# Tech tracking
tech-stack:
  added: []
  patterns: [raw-sql-batch-update-via-values-list, neon-http-sql-query-for-dynamic-sql, kangxi-radicals-static-map]

key-files:
  created:
    - src/lib/dictionary-parsers.ts
    - scripts/seed-dictionary.ts
  modified:
    - .gitignore
    - package.json

key-decisions:
  - "Raw SQL batch UPDATE with VALUES list for CC-Canto merging — 200x faster than individual Drizzle ORM updates over neon HTTP"
  - "Tone 5 (neutral) stripped before pinyin-pro convert() since library returns literal '5' for neutral"
  - "Truncate-and-reseed idempotency strategy — UUID PKs prevent onConflictDoNothing dedup on content"
  - "Kangxi radicals static map with 214+ entries including CJK variant forms for radicalMeaning lookup"
  - "CC-Canto entries split into: readings-merge (106K jyutping updates to 'both'), dictionary-merge (25K updates + 21K new 'canto' inserts)"

patterns-established:
  - "neon sql.query() for dynamic SQL strings (tagged template for static only)"
  - "Batch UPDATE via VALUES clause join for bulk updates on neon HTTP driver"
  - "Parser library as pure functions (no DB deps) separated from seed script (DB + transform logic)"

# Metrics
duration: 31min
completed: 2026-02-08
---

# Phase 45 Plan 01: Dictionary Data Seeding Summary

**145K dictionary entries from CC-CEDICT/CC-Canto and 9.5K characters from Make Me a Hanzi seeded into Postgres with tone-mark pinyin, jyutping, radical meanings, and stroke data**

## Performance

- **Duration:** 31 min
- **Started:** 2026-02-08T10:39:17Z
- **Completed:** 2026-02-08T11:09:54Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- 124,259 CC-CEDICT entries parsed and batch-inserted with pinyinDisplay tone marks (u: handled, neutral tone stripped)
- 105,862 CC-Canto readings merged via batch SQL UPDATE, updating source to 'both' and adding jyutping
- 25,421 CC-Canto dictionary entries processed: 3,784 merged with existing entries, 21,637 new canto-only entries inserted
- 9,574 Make Me a Hanzi characters seeded with radical, decomposition, etymology, stroke paths/medians, and generated jyutping via to-jyutping

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dictionary parser library and download data files** - `7ac8592` (feat)
2. **Task 2: Create and run seed script for all 3 data sources** - `de98927` (feat)

## Files Created/Modified
- `src/lib/dictionary-parsers.ts` - Pure parsing functions for CC-CEDICT, CC-Canto, Make Me a Hanzi (5 exports + 4 interfaces)
- `scripts/seed-dictionary.ts` - Standalone seed script with batch insert/update, Kangxi radicals map, pinyin conversion
- `.gitignore` - Added /data/ exclusion for large dictionary source files
- `package.json` - Added db:seed-dictionary npm script

## Decisions Made
- Used raw SQL batch UPDATE with VALUES list instead of individual Drizzle ORM updates for CC-Canto merging, reducing ~106K individual round-trips to ~530 batch queries (200x faster)
- Tone 5 (neutral tone in CEDICT format) must be stripped before passing to pinyin-pro convert(), which returns literal "ma5" instead of "ma" for neutral tones
- Adopted truncate-and-reseed idempotency because dictionary_entries uses random UUIDs (no content-based unique constraint), making onConflictDoNothing ineffective for dedup
- Built Kangxi radicals static map with 214+ entries including CJK variant forms since Make Me a Hanzi data does not include radical English meanings
- neon serverless v1.0 requires tagged template syntax for static SQL; use sql.query() for dynamic SQL strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed neon serverless API for dynamic SQL**
- **Found during:** Task 2 (seed script implementation)
- **Issue:** neon v1.0 no longer supports `sql("SELECT...")` function call syntax — requires tagged template `sql\`SELECT...\`` or `sql.query()` for dynamic strings
- **Fix:** Used `sqlClient.query(queryString, [])` for all dynamic SQL in batch UPDATE operations
- **Files modified:** scripts/seed-dictionary.ts
- **Verification:** All batch updates executed successfully
- **Committed in:** de98927 (Task 2 commit)

**2. [Rule 1 - Bug] Fixed pinyin-pro neutral tone handling**
- **Found during:** Task 2 (seed script implementation)
- **Issue:** pinyin-pro `convert("ma5")` returns `"ma5"` literally instead of `"ma"` (neutral/toneless). CEDICT uses tone 5 for neutral.
- **Fix:** Strip tone 5 from syllables (`/([a-zA-Zv])5/g` -> `$1`) before calling convert(), which correctly treats numberless syllables as neutral
- **Files modified:** scripts/seed-dictionary.ts
- **Verification:** Verified "A quan1 r5" converts to "A quan r" (neutral tone stripped)
- **Committed in:** de98927 (Task 2 commit)

**3. [Rule 1 - Bug] Optimized CC-Canto readings from individual to batch UPDATE**
- **Found during:** Task 2 (initial seed run)
- **Issue:** Individual UPDATE queries for 106K CC-Canto readings over neon HTTP took >10 minutes with no progress — each query is a separate HTTP round-trip
- **Fix:** Rewrote to use raw SQL batch UPDATE with VALUES clause, processing 200 entries per query. Reduced from ~106K round-trips to ~530.
- **Files modified:** scripts/seed-dictionary.ts
- **Verification:** Phase B1 completed in ~90 seconds instead of estimated 30+ minutes
- **Committed in:** de98927 (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness and performance. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required. Data files downloaded automatically during Task 1.

## Next Phase Readiness
- Dictionary data fully seeded, ready for Plan 02 (Dictionary Lookup API)
- All source distributions verified: 27K cedict-only, 97K both, 22K canto-only
- character_data has stroke paths and medians ready for hanzi-writer integration in later phases
- Seed script is re-runnable (truncates and reseeds) for future data updates

---
*Phase: 45-dictionary-data-pipeline*
*Completed: 2026-02-08*
