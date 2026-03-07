---
phase: 57-builder-completion
plan: 01
subsystem: ui, api, database
tags: [react-flow, drizzle, next-api, positions, persistence]

# Dependency graph
requires:
  - phase: 56-flow-editor-node-ux
    provides: "FlowEditor component with node types, edge handling, drag-and-drop"
provides:
  - "positionX/positionY columns on video_thread_steps for layout persistence"
  - "Full save/load cycle for node positions, logicRules, and fallbackStepId"
  - "Migration 0021 for position columns"
  - "Builder page wiring: positions merged into save, populated on load"
affects: [57-02, 58-basic-player]

# Tech tracking
tech-stack:
  added: []
  patterns: ["bidirectional position sync between FlowEditor and DB via nodePositions state"]

key-files:
  created:
    - "src/db/migrations/0021_add_step_positions.sql"
  modified:
    - "src/db/schema/video-threads.ts"
    - "src/db/migrations/meta/_journal.json"
    - "src/app/api/admin/video-threads/[threadId]/steps/route.ts"
    - "src/components/video-thread/FlowEditor.tsx"
    - "src/app/(dashboard)/admin/video-threads/[threadId]/builder/page.tsx"

key-decisions:
  - "Task 1 already completed in prior commit 0240722; only Task 2 required execution"
  - "positionX/positionY added to addNewStep defaults to avoid TypeScript errors"

patterns-established:
  - "Position merge pattern: nodePositions state tracks drag positions, merged into steps on save"
  - "Re-fetch after save pattern: POST save then GET to sync, including position re-population"

# Metrics
duration: 7m 23s
completed: 2026-02-14
---

# Phase 57 Plan 01: Persist Node Layout Summary

**Bidirectional position persistence: FlowEditor node positions save to DB via positionX/positionY columns and restore on page reload**

## Performance

- **Duration:** 7m 23s
- **Started:** 2026-02-14T04:39:30Z
- **Completed:** 2026-02-14T04:46:53Z
- **Tasks:** 2
- **Files modified:** 1 (Task 1 was pre-committed)

## Accomplishments
- Full save/load cycle for node positions -- coach drags nodes, clicks Save, reloads and sees same layout
- logicRules and fallbackStepId now persist through the PUT upsert (insert + onConflictDoUpdate)
- Builder page merges FlowEditor drag positions into save payload via stepsWithPositions
- Fetched step data populates nodePositions state for FlowEditor initial positions

## Task Commits

Each task was committed atomically:

1. **Task 1: Add position columns to DB schema and update API** - `0240722` (feat) -- pre-existing commit
2. **Task 2: Wire FlowEditor positions into save/load cycle** - `ec89785` (feat)

## Files Created/Modified
- `src/db/schema/video-threads.ts` - Added positionX/positionY integer columns to videoThreadSteps
- `src/db/migrations/0021_add_step_positions.sql` - ALTER TABLE to add position_x and position_y columns
- `src/db/migrations/meta/_journal.json` - Migration journal entry for 0021
- `src/app/api/admin/video-threads/[threadId]/steps/route.ts` - PUT handler persists logicRules, fallbackStepId, positionX, positionY
- `src/components/video-thread/FlowEditor.tsx` - onPositionsChange prop, persisted position loading, drag tracking
- `src/app/(dashboard)/admin/video-threads/[threadId]/builder/page.tsx` - onPositionsChange wiring, stepsWithPositions merge, position population on fetch

## Decisions Made
- Task 1 was already committed (`0240722`) from a prior session; verified and skipped re-execution
- Added positionX/positionY defaults (0, 150) to addNewStep objects to satisfy TypeScript (Rule 1 - Bug fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added positionX/positionY to addNewStep objects**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** `addNewStep` function created PlayerStep objects without positionX/positionY, causing TS2739 errors since schema now requires them
- **Fix:** Added `positionX: 0, positionY: 150` to both logic and video step creation objects
- **Files modified:** `src/app/(dashboard)/admin/video-threads/[threadId]/builder/page.tsx`
- **Verification:** `npx tsc --noEmit` no longer shows positionX/positionY errors
- **Committed in:** `ec89785` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for TypeScript correctness. No scope creep.

## Issues Encountered
- Build (`npm run build`) fails due to 25 pre-existing module-not-found errors (sonner, @xyflow/react, jieba-wasm, etc. not installed). These are not related to plan changes.

## User Setup Required
None - no external service configuration required. Migration 0021 is ready to apply via `npm run db:migrate` when DATABASE_URL is available.

## Next Phase Readiness
- Position persistence complete, ready for 57-02 (video picker + library integration)
- Save/load cycle fully wired -- coach's node layout and logic routing data persist through refresh
- Edges reconstruct from logicRules/fallbackStepId on reload

---
## Self-Check: PASSED

- All 6 key files: FOUND
- Commit 0240722 (Task 1): FOUND
- Commit ec89785 (Task 2): FOUND

*Phase: 57-builder-completion*
*Completed: 2026-02-14*
