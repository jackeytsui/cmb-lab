---
phase: 38-production-hardening
plan: 03
subsystem: database, ui
tags: [drizzle, eslint, n+1-query, promise-all, react-hooks, typescript]

# Dependency graph
requires:
  - phase: 38-01
    provides: Clean build baseline and FK indexes for query optimization
provides:
  - Optimized single-query practice set loading with Drizzle `with` clause
  - Parallelized student assignment resolution with Promise.all
  - Zero ESLint errors across the entire codebase
affects: [39-gamification-xp, 40-celebrations, 41-progress-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Drizzle `with` clause for eager loading related entities"
    - "Promise.all for parallelizing independent database queries"
    - "eslint-disable-next-line with explanatory comments for intentional suppressions"

key-files:
  created: []
  modified:
    - "src/app/(dashboard)/practice/[setId]/page.tsx"
    - "src/lib/assignments.ts"
    - "src/components/admin/VideoPreviewPlayer.tsx"
    - "src/hooks/useBuilderState.ts"
    - "src/app/(dashboard)/dashboard/practice/page.tsx"
    - "src/app/(dashboard)/coach/pronunciation/page.tsx"

key-decisions:
  - "Convert durationRef to state in VideoPreviewPlayer (ref reads during render are errors)"
  - "Suppress zodResolver `as any` with comments rather than complex generic casts (known rhf/zod type gap)"
  - "Restructure try/catch in practice dashboard to separate data fetching from JSX rendering"
  - "Use type predicate filter for pronunciation JSONB data to get proper type narrowing"

patterns-established:
  - "N+1 fix: use db.query.X.findFirst({ with: { relation } }) for single-query eager loading"
  - "Parallel queries: wrap independent DB queries in Promise.all with destructured results"
  - "ESLint suppress pattern: // eslint-disable-next-line rule-name -- explanation of why"

# Metrics
duration: 31min
completed: 2026-02-07
---

# Phase 38 Plan 03: N+1 Query Optimization and ESLint Zero-Error Summary

**Single-query practice set loading via Drizzle `with` clause, parallelized assignment resolution, and 28 ESLint errors eliminated across 46 files**

## Performance

- **Duration:** 31 min
- **Started:** 2026-02-07T15:02:12Z
- **Completed:** 2026-02-07T15:32:47Z
- **Tasks:** 2
- **Files modified:** 48

## Accomplishments
- Practice results page consolidated from 3 sequential queries to 1 Drizzle query with `with: { exercises }` clause + parallel user fetch via Promise.all
- Student assignment resolution parallelized: tags and enrollments now fetched simultaneously instead of sequentially
- All 28 ESLint errors resolved: 0 errors remain (15 acceptable warnings for underscore-prefixed unused vars and library compatibility)
- Genuine bugs fixed: misused `useState` as `useEffect`, ref reads during render, missing dependency arrays

## Task Commits

Each task was committed atomically:

1. **Task 1: Optimize N+1 queries on practice results and assignments** - `ca2fd71` (perf)
2. **Task 2: Fix all ESLint errors (28 errors across the codebase)** - `04855e0` (fix)

## Files Created/Modified

### Task 1 (Query Optimization)
- `src/app/(dashboard)/practice/[setId]/page.tsx` - Consolidated to single Drizzle query with `with: { exercises }` + Promise.all for parallel user fetch
- `src/lib/assignments.ts` - Parallelized tag and enrollment queries with Promise.all, removed unused `isNotNull` import

### Task 2 (ESLint Fixes) - 46 files across 8 error categories
- `src/app/(dashboard)/dashboard/practice/page.tsx` - Restructured try/catch to fix error-boundaries rule
- `src/app/(dashboard)/dashboard/page.tsx` - Escaped apostrophe in JSX
- `src/components/admin/VideoPreviewPlayer.tsx` - Converted durationRef to state, fixed dependency arrays
- `src/app/(dashboard)/test-interactive/page.tsx` - Replaced misused useState with useEffect
- `src/hooks/useBuilderState.ts` - Replaced useRef with useMemo for render-time access
- `src/app/(dashboard)/coach/pronunciation/page.tsx` - Replaced `any` with typed interface for JSONB data
- `src/components/admin/exercises/*.tsx` (7 files) - Added eslint-disable for zodResolver type mismatch
- `src/hooks/useNotifications.ts`, `usePWAInstall.ts`, `useSubtitlePreference.ts` - Suppressed intentional setState-in-effect
- `src/components/chat/ChatWidget.tsx`, `src/components/pwa/InstallPrompt.tsx` - Suppressed intentional setState-in-effect
- `src/components/ui/sidebar.tsx` - Suppressed intentional Math.random in shadcn skeleton
- 20+ files with unused import/variable cleanup

## Decisions Made

1. **durationRef -> state conversion**: VideoPreviewPlayer used a ref for duration that was read during render. Converting to state is the correct fix since duration changes should trigger re-renders for progress bar updates.

2. **zodResolver `as any` suppression over complex casts**: The type mismatch between `@hookform/resolvers/zod` and `react-hook-form`'s `Resolver` generic is a known ecosystem issue. Suppressing with explanatory comments is cleaner than `as unknown as Resolver<T>` chains.

3. **try/catch restructure in practice dashboard**: Instead of wrapping JSX in try/catch (which the React compiler flags), separated data fetching into a variable and used conditional rendering.

4. **Type predicate filter for JSONB data**: Used `filter((entry): entry is [string, T] => ...)` pattern for proper type narrowing of pronunciation JSONB data instead of non-null assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed misused useState as useEffect in test-interactive page**
- **Found during:** Task 2
- **Issue:** `useState(() => { ... })` was being used like `useEffect` to set up an interval. This is incorrect - `useState` initializers run during render, not as side effects.
- **Fix:** Changed to `useEffect(() => { ... }, [updateDebugInfo])` with proper cleanup and dependency array
- **Files modified:** `src/app/(dashboard)/test-interactive/page.tsx`
- **Committed in:** `04855e0`

**2. [Rule 1 - Bug] Fixed missing dependency arrays in VideoPreviewPlayer callbacks**
- **Found during:** Task 2
- **Issue:** After converting `durationRef` to `duration` state, the `seekTo` and `handleTimelineClick` callbacks had stale closures over `duration` because it wasn't in their dependency arrays
- **Fix:** Added `duration` to both `useCallback` dependency arrays
- **Files modified:** `src/components/admin/VideoPreviewPlayer.tsx`
- **Committed in:** `04855e0`

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correctness. The useState/useEffect confusion was a genuine bug. The missing deps were a consequence of the ref-to-state conversion needed to fix the original ESLint error.

## Issues Encountered
- Coach submissions route (`src/app/api/coach/submissions/route.ts`) does not exist. Plan mentioned auditing it for N+1 patterns but the file was never created. Skipped Part C of Task 1 as there was nothing to audit.
- The `--fix` auto-removal of stale `eslint-disable` directives meant the script that added new disable comments had to account for blank lines left behind. Required a second pass to fix comment placement.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Codebase is clean: 0 ESLint errors, TypeScript passes, build succeeds
- Query patterns optimized for key student-facing pages
- Ready for Phase 38-04 (remaining production hardening) or Phase 39 (gamification)

## Self-Check: PASSED

---
*Phase: 38-production-hardening*
*Completed: 2026-02-07*
