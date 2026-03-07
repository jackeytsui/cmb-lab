---
phase: 38-production-hardening
plan: 04
subsystem: ui
tags: [nextjs, loading, skeleton, suspense, ux]

# Dependency graph
requires:
  - phase: 38-01
    provides: "Build passing, app shell layout with sidebar"
provides:
  - "Loading skeletons for 15 high-traffic page directories"
  - "26 total loading.tsx files covering student, coach, and admin routes"
affects: [39-gamification, 40-celebrations, 41-progress-dashboard, 42-coach-practice-results]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Loading skeleton pattern: default export function, Skeleton from @/components/ui/skeleton, bg-zinc-800, content-area only (no sidebar/header duplication)"

key-files:
  created:
    - src/app/(dashboard)/settings/loading.tsx
    - src/app/(dashboard)/my-conversations/loading.tsx
    - src/app/(dashboard)/dashboard/practice/loading.tsx
    - src/app/(dashboard)/practice/[setId]/loading.tsx
    - src/app/(dashboard)/coach/students/loading.tsx
    - src/app/(dashboard)/coach/pronunciation/loading.tsx
    - src/app/(dashboard)/coach/conversations/[conversationId]/loading.tsx
    - src/app/(dashboard)/admin/exercises/loading.tsx
    - src/app/(dashboard)/admin/analytics/loading.tsx
    - src/app/(dashboard)/admin/content/loading.tsx
    - src/app/(dashboard)/admin/courses/loading.tsx
    - src/app/(dashboard)/admin/prompts/loading.tsx
    - src/app/(dashboard)/admin/ghl/loading.tsx
    - src/app/(dashboard)/admin/students/[studentId]/loading.tsx
    - src/app/(dashboard)/admin/practice-sets/[setId]/builder/loading.tsx
  modified: []

key-decisions:
  - "Each skeleton matches real page layout structure (read actual page.tsx to design skeletons)"
  - "Content container matches page's own container (e.g., content page uses max-w-7xl p-6, settings uses max-w-2xl)"
  - "Low-traffic child pages inherit parent loading.tsx via Next.js convention rather than getting dedicated skeletons"

patterns-established:
  - "Loading skeleton convention: export default function XxxLoading(), Skeleton import, bg-zinc-800, no sidebar/header"
  - "Skeleton density matches page: tables get row skeletons, cards get card skeletons, forms get field pair skeletons"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 38 Plan 04: Loading Skeletons Summary

**15 page-specific loading.tsx skeletons covering all high-traffic student, coach, and admin routes with layout-matched skeleton structure**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T15:02:53Z
- **Completed:** 2026-02-07T15:10:21Z
- **Tasks:** 2
- **Files created:** 15

## Accomplishments
- 7 loading skeletons for student/coach pages (settings, conversations, practice, pronunciation, students)
- 8 loading skeletons for admin pages (exercises, analytics, content, courses, prompts, ghl, student detail, practice-set builder)
- Total loading.tsx count: 26 across the app (11 existing + 15 new)
- Each skeleton matches the real page layout: read actual page.tsx first, then designed matching skeleton structure
- Build passes with all new files

## Task Commits

Each task was committed atomically:

1. **Task 1: Create loading.tsx for student and coach pages** - `a4e23e7` (feat)
2. **Task 2: Create loading.tsx for admin pages** - `c0416d8` (feat)

## Files Created/Modified
- `src/app/(dashboard)/settings/loading.tsx` - Settings page: form fields with daily goal tier grid
- `src/app/(dashboard)/my-conversations/loading.tsx` - Conversation card list with lesson titles and meta
- `src/app/(dashboard)/dashboard/practice/loading.tsx` - Assignment card grid with filter bar
- `src/app/(dashboard)/practice/[setId]/loading.tsx` - Practice player: progress bar + exercise area
- `src/app/(dashboard)/coach/students/loading.tsx` - Student table with search, tags, avatar rows
- `src/app/(dashboard)/coach/pronunciation/loading.tsx` - Score cards with sub-score badges
- `src/app/(dashboard)/coach/conversations/[conversationId]/loading.tsx` - Two-column: info cards + transcript bubbles
- `src/app/(dashboard)/admin/exercises/loading.tsx` - Practice set cards with exercise rows
- `src/app/(dashboard)/admin/analytics/loading.tsx` - Stat cards grid + chart area
- `src/app/(dashboard)/admin/content/loading.tsx` - Header + tabs + video card grid
- `src/app/(dashboard)/admin/courses/loading.tsx` - Course list with status badges
- `src/app/(dashboard)/admin/prompts/loading.tsx` - Icon header + type filter + prompt rows
- `src/app/(dashboard)/admin/ghl/loading.tsx` - Connection + field mapping + auto-tag + sync log
- `src/app/(dashboard)/admin/students/[studentId]/loading.tsx` - Avatar header + tab bar + content area
- `src/app/(dashboard)/admin/practice-sets/[setId]/builder/loading.tsx` - Toolbar + palette/canvas columns

## Decisions Made
- Matched each skeleton to its actual page layout by reading page.tsx before designing the skeleton
- Used same container/padding as the real page (e.g., admin/content uses `mx-auto max-w-7xl p-6`, settings uses `max-w-2xl`)
- Low-traffic child routes (exercises/new, courses/[id]/*, prompts/[id]) inherit parent loading.tsx rather than getting dedicated skeletons

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All high-traffic pages now show skeleton UI during data fetching
- Future phases adding new pages should follow the established loading skeleton pattern
- No blockers for subsequent phases

## Self-Check: PASSED

---
*Phase: 38-production-hardening*
*Completed: 2026-02-07*
