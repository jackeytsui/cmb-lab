---
phase: 75-lto-student-access-mandarin-accelerator
plan: 02
subsystem: ui, api, database
tags: [typing-drill, chinese-input, progress-tracking, feature-gate, admin-panel]
dependency_graph:
  requires:
    - phase: 75-01
      provides: accelerator DB schema, mandarin_accelerator feature key, sidebar nav
  provides:
    - Admin CRUD + bulk upload API for typing sentences
    - Student-facing Duolingo-style typing drill with character feedback
    - Per-student typing progress tracking API
  affects: [accelerator-typing, student-dashboard]
tech_stack:
  added: []
  patterns: [normalizeForComparison-chinese-text, getCharFeedback-character-level, retry-until-correct-drill]
key_files:
  created:
    - src/app/api/admin/accelerator/typing/route.ts
    - src/app/(dashboard)/admin/accelerator/typing/page.tsx
    - src/app/(dashboard)/admin/accelerator/typing/AdminTypingClient.tsx
    - src/app/api/accelerator/typing/progress/route.ts
    - src/app/(dashboard)/dashboard/accelerator/typing/page.tsx
    - src/app/(dashboard)/dashboard/accelerator/typing/TypingDrillClient.tsx
  modified:
    - src/db/schema/accelerator.ts
    - src/db/schema/index.ts
    - src/lib/permissions.ts
    - src/components/auth/FeatureGate.tsx
key_decisions:
  - "Used hasMinimumRole('coach') pattern matching existing admin routes"
  - "Accepted both bare array and { sentences: [...] } in bulk upload for flexibility"
  - "Optimistic local state for progress with fire-and-forget API POST"
  - "Created accelerator schema in this plan since parallel execution with Plan 01"
patterns-established:
  - "normalizeForComparison: NFC normalize, strip zero-width chars + punctuation + whitespace for Chinese text comparison"
  - "getCharFeedback: character-by-character diff for visual red/green feedback"
  - "Retry-until-correct drill flow: wrong answer shows feedback 1.5s then resets, correct auto-advances 800ms"
requirements-completed: [LTO-05, LTO-06, LTO-07, LTO-08]
duration: 269s
completed: 2026-03-24
---

# Phase 75 Plan 02: Chinese Typing Unlock Kit Summary

**Admin CRUD with JSON bulk upload and Duolingo-style student typing drill with NFC-normalized exact-match checking, character-by-character feedback, and per-student progress persistence.**

## Performance

- **Duration:** 4 min 29s
- **Started:** 2026-03-24T22:43:37Z
- **Completed:** 2026-03-24T22:48:06Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Admin API with GET/POST/PUT/DELETE for typing sentences, supporting both single and bulk JSON upload via z.union schema validation
- Admin panel with table view, add/edit dialog (shadcn Select/Input/Dialog), delete confirmation, and JSON file upload button
- Student typing drill page with Mandarin/Cantonese section cards showing completion progress bars
- Drill flow: English + romanisation prompt, student types Chinese, exact-match with normalizeForComparison (NFC, strips punctuation/zero-width), green/red feedback, character-by-character diff, retry-until-correct
- Progress API with upsert (onConflictDoNothing) and optimistic client state

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin API and panel for typing sentences** - `4800da7` (feat)
2. **Task 2: Student typing drill UI with progress tracking** - `708eb5c` (feat)

## Files Created/Modified
- `src/db/schema/accelerator.ts` - All accelerator tables (typing, scripts, passages, progress)
- `src/db/schema/index.ts` - Added accelerator export
- `src/lib/permissions.ts` - Added mandarin_accelerator to FEATURE_KEYS
- `src/components/auth/FeatureGate.tsx` - Added Mandarin Accelerator label
- `src/app/api/admin/accelerator/typing/route.ts` - CRUD + bulk upload API, coach-gated
- `src/app/(dashboard)/admin/accelerator/typing/page.tsx` - Admin page with coach guard
- `src/app/(dashboard)/admin/accelerator/typing/AdminTypingClient.tsx` - Table, dialogs, bulk upload UI
- `src/app/api/accelerator/typing/progress/route.ts` - Student progress GET/POST with onConflictDoNothing
- `src/app/(dashboard)/dashboard/accelerator/typing/page.tsx` - Feature-gated student page
- `src/app/(dashboard)/dashboard/accelerator/typing/TypingDrillClient.tsx` - Full drill UI with sections, feedback, progress

## Decisions Made
1. **hasMinimumRole pattern**: Used `hasMinimumRole("coach")` matching existing admin route patterns (plan said `requireMinimumRole` which doesn't exist)
2. **Flexible bulk upload**: Accept both bare array `[...]` and `{ sentences: [...] }` in the client, always send `{ sentences }` to API
3. **Optimistic progress**: Update local state immediately on correct answer, POST to API as fire-and-forget
4. **Schema creation in Plan 02**: Created accelerator schema here since parallel execution means Plan 01's worktree is separate

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created accelerator schema file**
- **Found during:** Task 1 (Admin API creation)
- **Issue:** Plan 01 runs in a separate parallel worktree; this worktree lacked the accelerator.ts schema file
- **Fix:** Created the full schema file matching Plan 01's spec (7 tables, 1 enum, relations)
- **Files modified:** src/db/schema/accelerator.ts, src/db/schema/index.ts
- **Verification:** TypeScript compiles cleanly

**2. [Rule 3 - Blocking] Added mandarin_accelerator feature key**
- **Found during:** Task 2 (Student page with FeatureGate)
- **Issue:** mandarin_accelerator not in FEATURE_KEYS (Plan 01 dependency, separate worktree)
- **Fix:** Added to FEATURE_KEYS in permissions.ts and FEATURE_LABELS in FeatureGate.tsx
- **Files modified:** src/lib/permissions.ts, src/components/auth/FeatureGate.tsx

**3. [Rule 1 - Bug] Used hasMinimumRole instead of requireMinimumRole**
- **Found during:** Task 1 (Admin API)
- **Issue:** Plan specified `requireMinimumRole("coach")` but codebase exports `hasMinimumRole`
- **Fix:** Used `hasMinimumRole("coach")` matching existing admin routes pattern
- **Files modified:** src/app/api/admin/accelerator/typing/route.ts

---

**Total deviations:** 3 auto-fixed (2 blocking, 1 bug)
**Impact on plan:** All fixes necessary for parallel worktree execution and codebase consistency. No scope creep.

## Issues Encountered
None beyond the parallel worktree dependency resolution documented above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Typing drill feature complete and ready for content entry via admin panel
- Plans 03 (Conversation Scripts) and 04 (Curated Reader) can proceed independently
- Schema is shared across all three accelerator features

---
*Phase: 75-lto-student-access-mandarin-accelerator*
*Completed: 2026-03-24*
