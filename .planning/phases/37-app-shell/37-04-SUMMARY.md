---
phase: 37-app-shell
plan: 04
subsystem: ui
tags: [next.js, app-router, sidebar, layout, migration, AppHeader]

# Dependency graph
requires:
  - phase: 37-app-shell (37-02)
    provides: Shared sidebar layout with SidebarProvider, AppSidebar, SidebarInset wrapping all (dashboard) pages
provides:
  - All ~50 (dashboard) pages render content-only without per-page shells
  - Zero AppHeader imports remain in any (dashboard) page
  - Zero min-h-screen page-level wrappers remain
  - Sidebar layout is the single source of outer shell
affects: [37-app-shell remaining plans, all future UI work under (dashboard)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pages render content containers only (no outer shell), relying on sidebar layout"
    - "Loading skeletons render inside sidebar without AppHeader"

key-files:
  created: []
  modified:
    - "src/app/(dashboard)/dashboard/page.tsx"
    - "src/app/(dashboard)/admin/page.tsx"
    - "src/app/(dashboard)/coach/page.tsx"
    - "src/app/(dashboard)/admin/analytics/page.tsx"
    - "src/app/(dashboard)/admin/ghl/page.tsx"
    - "src/app/(dashboard)/admin/knowledge/[entryId]/page.tsx"
    - "src/app/(dashboard)/test-interactive/page.tsx"
    - "~50 total pages across student, coach, admin, and test directories"

key-decisions:
  - "Kept padding on content/uploads pages (p-6) since they used different layout than container pattern"
  - "Removed bg-zinc-950 and bg-zinc-900 variants equally -- sidebar layout provides background"
  - "Test pages (test-interactive, test-video) also migrated for consistency"

patterns-established:
  - "All (dashboard) pages use content-only pattern: no AppHeader, no min-h-screen wrapper"
  - "Error return paths follow same pattern as success return paths"

# Metrics
duration: ~15min
completed: 2026-02-07
---

# Phase 37 Plan 04: Strip Per-Page Shells Summary

**Removed AppHeader imports and min-h-screen wrappers from all ~50 (dashboard) pages, completing migration to shared sidebar layout**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-02-07T13:50:00Z
- **Completed:** 2026-02-07T14:05:29Z
- **Tasks:** 2
- **Files modified:** 50

## Accomplishments
- Removed AppHeader imports from all pages that had them (dashboard, coach, admin/exercises, admin/analytics, admin/ghl)
- Removed min-h-screen wrapper divs from all 50 pages across student, coach, admin, and test directories
- Fixed orphaned closing `</div>` tags in pages with multiple return paths (error, loading, success)
- TypeScript compilation verified clean with zero errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate student and coach pages** - `9b22c5d` (feat)
2. **Task 2: Migrate admin pages and test pages** - `fdb4cc6` (feat)

## Files Created/Modified
- `src/app/(dashboard)/dashboard/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/dashboard/practice/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/dashboard/loading.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/courses/[courseId]/page.tsx` - Removed min-h-screen from success + error paths
- `src/app/(dashboard)/courses/[courseId]/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/lessons/[lessonId]/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/lessons/[lessonId]/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/practice/[setId]/page.tsx` - Removed min-h-screen bg-zinc-950
- `src/app/(dashboard)/my-conversations/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/my-feedback/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/my-feedback/loading.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/loading.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/conversations/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/conversations/loading.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/conversations/[conversationId]/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/coach/pronunciation/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/students/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/coach/submissions/[submissionId]/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/loading.tsx` - Rewrote without AppHeader/min-h-screen
- `src/app/(dashboard)/admin/courses/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/courses/new/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/courses/[courseId]/page.tsx` - Removed min-h-screen from 3 return paths
- `src/app/(dashboard)/admin/courses/[courseId]/modules/new/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/page.tsx` - Removed min-h-screen from 3 return paths
- `src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/lessons/new/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/courses/[courseId]/modules/[moduleId]/lessons/[lessonId]/page.tsx` - Removed min-h-screen from 3 return paths
- `src/app/(dashboard)/admin/students/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/students/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/students/[studentId]/page.tsx` - Removed min-h-screen from 2 return paths
- `src/app/(dashboard)/admin/exercises/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/exercises/new/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/exercises/[exerciseId]/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/content/page.tsx` - Removed min-h-screen bg-zinc-950
- `src/app/(dashboard)/admin/content/uploads/page.tsx` - Removed min-h-screen bg-zinc-950
- `src/app/(dashboard)/admin/analytics/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/ghl/page.tsx` - Removed AppHeader + min-h-screen
- `src/app/(dashboard)/admin/ai-logs/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/ai-logs/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/knowledge/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/knowledge/loading.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/knowledge/new/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/knowledge/[entryId]/page.tsx` - Removed min-h-screen from 2 return paths
- `src/app/(dashboard)/admin/knowledge/search/SearchPageClient.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/prompts/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/admin/prompts/[promptId]/page.tsx` - Removed min-h-screen
- `src/app/(dashboard)/test-interactive/page.tsx` - Removed min-h-screen bg-zinc-950
- `src/app/(dashboard)/test-video/page.tsx` - Removed min-h-screen bg-zinc-950

## Decisions Made
- Kept `p-6` padding on admin/content pages since they used a different layout pattern (max-w-7xl + p-6 vs container mx-auto px-4 py-8)
- Treated bg-zinc-950 (used by content, test, and practice pages) same as bg-zinc-900 -- both removed since sidebar provides background
- Test pages migrated despite being dev-only for consistency across all (dashboard) routes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed orphaned closing div tags from previous session**
- **Found during:** Task 2 (build verification)
- **Issue:** Two files (admin/courses/.../lessons/[lessonId]/page.tsx and admin/students/[studentId]/page.tsx) had extra `</div>` tags left from the previous context window's edits, causing "Unterminated regexp literal" parse errors
- **Fix:** Removed the orphaned `</div>` closing tags from error/loading return paths
- **Files modified:** admin/courses/[courseId]/modules/[moduleId]/lessons/[lessonId]/page.tsx, admin/students/[studentId]/page.tsx
- **Verification:** `npx tsc --noEmit` passes clean, `npm run build` compiles successfully
- **Committed in:** fdb4cc6 (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor fix for orphaned HTML tags. No scope creep.

## Issues Encountered
- Build prerendering phase fails due to missing Clerk publishable key and Upstash Redis env vars (pre-existing infrastructure issue, not related to code changes). TypeScript compilation succeeds cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All (dashboard) pages now render content-only inside the sidebar layout
- Phase 37 (App Shell & Navigation) is complete with all 4 plans finished
- Ready for Phase 38 or other v5.0 phases

## Self-Check: PASSED

---
*Phase: 37-app-shell*
*Completed: 2026-02-07*
