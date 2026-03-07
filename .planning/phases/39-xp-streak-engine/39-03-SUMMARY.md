---
phase: 39-xp-streak-engine
plan: 03
subsystem: api
tags: [xp, gamification, drizzle, upsert, fire-and-forget, streak, daily-activity, rest-api]

# Dependency graph
requires:
  - phase: 39-xp-streak-engine
    plan: 01
    provides: xp_events and daily_activity tables, XPSource enum type
  - phase: 39-xp-streak-engine
    plan: 02
    provides: calculateLevel, getEffectiveDate, RING_GOALS, XP_AMOUNTS pure functions
provides:
  - awardXP service function with DB insert, daily_activity upsert, daily goal auto-bonus, and longestStreak update
  - getStreak function with freeze support (2/month) and backward date walking
  - getDailyActivity function returning today's effective-date summary
  - getXPDashboard function aggregating level, streak, daily, rings data
  - Fire-and-forget XP awards in lesson completion, practice attempt, and voice conversation routes
  - GET /api/xp endpoint returning full XP dashboard for authenticated user
affects: [39-04 (activity rings component), 39-05 (streak display), 41-progress-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: [fire-and-forget async with .catch for non-blocking XP awards, SQL CASE WHEN for conditional goalMet upsert, recursive awardXP with source guard for daily goal bonus]

key-files:
  created:
    - src/lib/xp-service.ts
    - src/app/api/xp/route.ts
  modified:
    - src/app/api/progress/[lessonId]/route.ts
    - src/app/api/practice/[setId]/attempts/route.ts
    - src/app/api/conversations/[conversationId]/route.ts

key-decisions:
  - "awardXP uses recursive call for daily goal bonus with source !== daily_goal_met guard to prevent infinite recursion"
  - "Streak freeze auto-applies on 1-day gaps during backward walk (not pre-applied to daily_activity rows)"
  - "Ring progress clamped to 0-1 range with Math.min for display-ready ratios"
  - "Practice XP awarded in both UPDATE (existing attempt) and INSERT (new attempt completed) paths"

patterns-established:
  - "Fire-and-forget XP: awardXP({...}).catch(err => console.error('[XP]...', err)) — never blocks primary user action"
  - "Daily activity upsert: ON CONFLICT increment counters with SQL expressions, CASE WHEN for goalMet"
  - "Streak backward walk: Set-based date lookup with subtractDays helper, freeze budget tracking"

# Metrics
duration: 10min
completed: 2026-02-08
---

# Phase 39 Plan 03: XP Service & API Wiring Summary

**XP award engine with fire-and-forget DB operations, daily goal auto-bonus, streak calculation with freeze support, wired into all 3 learning action routes plus GET /api/xp dashboard endpoint**

## Performance

- **Duration:** 10 min
- **Started:** 2026-02-08T01:25:45Z
- **Completed:** 2026-02-08T01:35:45Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Full XP award pipeline: awardXP inserts xp_events, upserts daily_activity with counter increments, auto-awards 10 XP daily goal bonus, updates longestStreak
- Streak calculator walks backward through daily_activity with 2 freezes/month auto-applied on 1-day gaps
- XP awards wired into lesson completion (50 XP), practice attempts (5-10 per exercise + 25 perfect bonus), and voice conversations (15 XP for 30+ seconds)
- GET /api/xp returns level info, streak, daily activity, and ring progress ratios for authenticated user

## Task Commits

Each task was committed atomically:

1. **Task 1: Create XP service with awardXP, getStreak, getDailyActivity, getXPDashboard** - `121738f` (feat)
2. **Task 2: Wire XP awards into existing API routes and create XP dashboard endpoint** - `d9f1b7e` (feat)

## Files Created/Modified
- `src/lib/xp-service.ts` - XP service layer: awardXP (insert + upsert + bonus + streak), getStreak (backward walk with freezes), getDailyActivity, getXPDashboard (408 lines)
- `src/app/api/xp/route.ts` - GET endpoint returning full XP dashboard data via getXPDashboard
- `src/app/api/progress/[lessonId]/route.ts` - Added fire-and-forget awardXP for lesson_complete (50 XP) inside lessonComplete conditional
- `src/app/api/practice/[setId]/attempts/route.ts` - Added fire-and-forget awardXP for practice_exercise (scaled) and practice_perfect (25 XP bonus) in both UPDATE and INSERT paths
- `src/app/api/conversations/[conversationId]/route.ts` - Added fire-and-forget awardXP for voice_conversation (15 XP) when durationSeconds >= 30

## Decisions Made
- awardXP uses recursive call pattern for daily goal bonus: when totalXp crosses goalXp threshold, it calls itself with source "daily_goal_met". The guard `source !== "daily_goal_met"` prevents infinite recursion. This keeps the bonus logic co-located with the award function.
- Streak freeze auto-application happens during the backward walk algorithm (not pre-written to daily_activity rows). This keeps freeze logic stateless and recomputable.
- Practice XP is awarded in both the UPDATE path (existing attempt completed) and INSERT path (new attempt created already completed) to handle both client patterns.
- Ring progress ratios clamped to 0-1 with Math.min for direct use as CSS/SVG fill percentages.
- Voice conversation XP requires minimum 30 seconds to prevent gaming with instant connect/disconnect.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

- Run `npm run db:migrate` to apply migration 0009 (xp_events, daily_activity tables + longestStreak column) to Neon database before XP features work at runtime

## Next Phase Readiness
- XP award pipeline complete: all 3 learning actions fire XP, daily goal bonus auto-awards, streak updates on each award
- GET /api/xp endpoint ready for frontend consumption in 39-04 (ActivityRings) and 39-05 (StreakDisplay)
- No blockers for next plan

## Self-Check: PASSED

All 5 files verified present. Both commits (121738f, d9f1b7e) verified in git log. All 4 exports (awardXP, getStreak, getDailyActivity, getXPDashboard) confirmed. TypeScript type check passes with zero source errors.

---
*Phase: 39-xp-streak-engine*
*Completed: 2026-02-08*
