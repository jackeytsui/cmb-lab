---
phase: 37-app-shell
plan: 01
subsystem: ui, database, api
tags: [shadcn-ui, sidebar, drizzle, preferences, middleware]

# Dependency graph
requires:
  - phase: 04-progress-system
    provides: "Users table and Drizzle schema"
provides:
  - "shadcn/ui sidebar primitives (SidebarProvider, Sidebar, SidebarContent, etc.)"
  - "dailyGoalXp and timezone columns on users table"
  - "Expanded preferences API (GET/PATCH for languagePreference, dailyGoalXp, timezone)"
  - "Middleware protection for /settings route"
affects: [37-02 sidebar layout, 37-03 settings page, 37-04 mobile nav, 39-gamification]

# Tech tracking
tech-stack:
  added: ["@radix-ui/react-tooltip", "@radix-ui/react-separator", "@radix-ui/react-collapsible", "@radix-ui/react-dropdown-menu", "@radix-ui/react-avatar"]
  patterns: ["shadcn/ui sidebar component pattern with SidebarProvider context"]

key-files:
  created:
    - src/components/ui/sidebar.tsx
    - src/components/ui/tooltip.tsx
    - src/components/ui/separator.tsx
    - src/components/ui/collapsible.tsx
    - src/components/ui/dropdown-menu.tsx
    - src/components/ui/avatar.tsx
    - src/hooks/use-mobile.ts
    - src/db/migrations/0007_rapid_lockjaw.sql
  modified:
    - src/db/schema/users.ts
    - src/app/api/user/preferences/route.ts
    - middleware.ts
    - src/components/ui/button.tsx
    - src/components/ui/sheet.tsx

key-decisions:
  - "dailyGoalXp range 10-500 with default 100 (matches XP system design)"
  - "timezone stored as free text with 64-char limit (IANA format)"
  - "Preferences API validates each field independently, partial updates supported"

patterns-established:
  - "shadcn/ui sidebar: SidebarProvider wraps layout, use-mobile hook for responsive"
  - "Preferences API: partial PATCH with per-field validation"

# Metrics
duration: 3min
completed: 2026-02-07
---

# Phase 37 Plan 01: Foundation Setup Summary

**shadcn/ui sidebar primitives installed, users table extended with dailyGoalXp/timezone, preferences API expanded, /settings route protected**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-07T13:39:15Z
- **Completed:** 2026-02-07T13:42:21Z
- **Tasks:** 4
- **Files modified:** 13

## Accomplishments
- Installed shadcn/ui sidebar component with all sub-dependencies (tooltip, separator, collapsible, dropdown-menu, avatar, use-mobile hook)
- Extended users table with dailyGoalXp (integer, default 100) and timezone (text, default "UTC") columns
- Expanded preferences API to GET/PATCH all three preference fields with validation
- Added /settings route to middleware protected route matcher

## Task Commits

Each task was committed atomically:

1. **Task 1: Install shadcn/ui sidebar and sub-dependencies** - `1d65d0f` (feat)
2. **Task 2: Extend users schema with dailyGoalXp and timezone** - `686c9e3` (feat)
3. **Task 3: Expand preferences API with new fields** - `99160c1` (feat)
4. **Task 4: Protect /settings route in middleware** - `4d9cbae` (feat)

## Files Created/Modified
- `src/components/ui/sidebar.tsx` - shadcn/ui sidebar primitives (SidebarProvider, Sidebar, SidebarContent, etc.)
- `src/components/ui/tooltip.tsx` - Tooltip primitives for sidebar collapsed state
- `src/components/ui/separator.tsx` - Separator for sidebar sections
- `src/components/ui/collapsible.tsx` - Collapsible for sidebar sub-menus
- `src/components/ui/dropdown-menu.tsx` - Dropdown menu for user menu
- `src/components/ui/avatar.tsx` - Avatar for user profile display
- `src/hooks/use-mobile.ts` - Mobile breakpoint detection hook
- `src/db/schema/users.ts` - Added dailyGoalXp and timezone columns
- `src/db/migrations/0007_rapid_lockjaw.sql` - Migration for new columns
- `src/app/api/user/preferences/route.ts` - Expanded GET/PATCH with three fields
- `middleware.ts` - Added /settings to protected routes
- `src/components/ui/button.tsx` - Updated for sidebar compatibility
- `src/components/ui/sheet.tsx` - Updated for sidebar mobile sheet

## Decisions Made
- dailyGoalXp validated as integer 10-500 (aligns with XP system design from v5.0 roadmap)
- timezone stored as free-form text with 64-char max (supports all IANA timezone identifiers)
- Preferences API uses partial updates: only provided fields are updated, empty payload returns 400

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

After deploying, run the migration to add the new columns to the production database:
```bash
npm run db:migrate
```

## Next Phase Readiness
- Sidebar primitives ready for Plan 02 (sidebar layout composition)
- Schema columns ready for Plan 03 (settings page)
- Middleware ready for /settings route in Plan 03
- Migration needs to be applied to Neon database before preferences API uses new fields

## Self-Check: PASSED

---
*Phase: 37-app-shell*
*Completed: 2026-02-07*
