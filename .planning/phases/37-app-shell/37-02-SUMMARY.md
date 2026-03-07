---
phase: 37-app-shell
plan: 02
subsystem: ui
tags: [sidebar, navigation, role-based, shadcn-ui, layout, 404]

# Dependency graph
requires:
  - phase: 37-app-shell-01
    provides: "shadcn/ui sidebar primitives (SidebarProvider, Sidebar, SidebarContent, etc.)"
provides:
  - "Dashboard layout with SidebarProvider wrapping all (dashboard) pages"
  - "AppSidebar with role-filtered navigation (Learning, Coach Tools, Admin)"
  - "NavMain with active page highlighting via usePathname"
  - "NavUser with Settings link and Clerk UserButton in sidebar footer"
  - "Branded 404 page with link to /dashboard"
affects: [37-03 settings page, 37-04 mobile nav migration, 38 production readiness]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Role-based sidebar filtering with hierarchy index comparison", "Active state detection via usePathname with prefix matching"]

key-files:
  created:
    - src/app/(dashboard)/layout.tsx
    - src/components/layout/AppSidebar.tsx
    - src/components/layout/NavMain.tsx
    - src/components/layout/NavUser.tsx
    - src/app/not-found.tsx
  modified: []

key-decisions:
  - "Dashboard active state only matches /dashboard exactly or /dashboard/practice prefix to avoid false matches on all nested routes"
  - "Sidebar uses collapsible=icon mode for collapse to icon-only (not offcanvas)"
  - "NavUser renders Clerk UserButton directly rather than custom user menu"
  - "Coach nav omits Submissions item since coach page serves as main queue"

patterns-established:
  - "Sidebar layout: SidebarProvider > AppSidebar + SidebarInset > header + main"
  - "Role filtering: roleHierarchy array index comparison for section visibility"
  - "Active nav: exact match for dashboard, prefix match for all other routes"

# Metrics
duration: 2min
completed: 2026-02-07
---

# Phase 37 Plan 02: Sidebar Layout Summary

**Dashboard layout with SidebarProvider, role-based AppSidebar (Learning/Coach/Admin sections), active page highlighting via usePathname, and branded 404 page**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-07T13:44:22Z
- **Completed:** 2026-02-07T13:46:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Dashboard layout wraps all (dashboard) pages in SidebarProvider + AppSidebar + SidebarInset with header bar (SidebarTrigger, SearchBar, NotificationBell)
- AppSidebar renders role-filtered navigation sections (student sees Learning, coach sees Learning + Coach Tools, admin sees all three)
- NavMain highlights current page using usePathname with smart prefix matching
- Sidebar collapses to icon-only mode via SidebarRail, persists open/closed state via cookie
- Branded 404 page with "Back to Dashboard" link for non-existent routes

## Task Commits

Each task was committed atomically:

1. **Task 1: Create dashboard layout with SidebarProvider** - `f0a52ae` (feat)
2. **Task 2: Build AppSidebar with role-based navigation and 404 page** - `30055c9` (feat)

## Files Created/Modified
- `src/app/(dashboard)/layout.tsx` - Server component wrapping all dashboard pages with SidebarProvider + AppSidebar + SidebarInset
- `src/components/layout/AppSidebar.tsx` - Main sidebar component with role-filtered nav sections, CantoMando brand header, SidebarRail
- `src/components/layout/NavMain.tsx` - Client component rendering nav sections with active state detection via usePathname
- `src/components/layout/NavUser.tsx` - Sidebar footer with Settings link and Clerk UserButton
- `src/app/not-found.tsx` - Branded 404 page with dark theme and "Back to Dashboard" link

## Decisions Made
- Dashboard route (`/dashboard`) uses exact match for active state (plus `/dashboard/practice` prefix) to avoid false highlighting on nested routes
- Sidebar uses `collapsible="icon"` mode rather than offcanvas collapse -- provides icon-only sidebar on collapse
- Coach nav omits Submissions item since the coach dashboard page at `/coach` serves as the main submission queue
- NavUser uses Clerk's UserButton directly (handles user data internally) rather than building custom user menu

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sidebar layout ready for Plan 03 (settings page) which builds the /settings route
- Plan 04 will migrate existing pages to remove old AppHeader (pages will show double headers until then)
- Mobile responsive sidebar (offcanvas sheet) is built into shadcn/ui sidebar component automatically

## Self-Check: PASSED

---
*Phase: 37-app-shell*
*Completed: 2026-02-07*
