---
phase: 14-e2e-testing
plan: 04
subsystem: infra
tags: [github-actions, playwright, ci, e2e]

# Dependency graph
requires:
  - phase: 14-e2e-testing-01
    provides: Playwright framework with Clerk auth and helpers
  - phase: 14-e2e-testing-02
    provides: E2E test specs for enrollment, grading, interactions
  - phase: 14-e2e-testing-03
    provides: E2E test specs for lesson completion and coach review
provides:
  - GitHub Actions E2E workflow triggered on PRs to main
  - CI-aware Playwright config using production build
  - CI setup documentation with all required secrets
affects: [16-branch-protection]

# Tech tracking
tech-stack:
  added: []
  patterns: [CI production build via npm run build + npm run start, Playwright webServer auto-start in CI]

key-files:
  created:
    - .github/workflows/e2e.yml
    - docs/CI_SETUP.md
  modified:
    - playwright.config.ts

key-decisions:
  - "Playwright webServer.command handles server lifecycle in CI (no separate start step)"
  - "Upload playwright-report artifact on every run (!cancelled), not just failure"
  - "All 8 secrets documented in CI_SETUP.md with source locations"

patterns-established:
  - "CI uses production build: npm run build then Playwright spawns npm run start"
  - "Playwright config branches on process.env.CI for command, reuse, workers, retries, reporter"

# Metrics
duration: 1min
completed: 2026-01-30
---

# Phase 14 Plan 04: CI Pipeline for E2E Tests Summary

**GitHub Actions E2E workflow with production build, Playwright auto-server, 8-secret config, and CI setup docs**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-30T08:34:17Z
- **Completed:** 2026-01-30T08:35:27Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- GitHub Actions workflow triggers E2E tests on every PR to main with 30-min timeout
- Playwright config uses production build in CI (npm run start) with automatic server lifecycle
- All 8 required GitHub Secrets mapped in workflow with proper build/runtime separation
- Playwright report uploaded as artifact on every run (14-day retention)
- CI_SETUP.md documents all secrets, test account creation, and workflow behavior

## Task Commits

Each task was committed atomically:

1. **Task 1: GitHub Actions E2E workflow and CI config updates** - `9dd7274` (feat)
2. **Task 2: Document required GitHub Secrets and test account setup** - `85c8442` (docs)

## Files Created/Modified
- `.github/workflows/e2e.yml` - GitHub Actions E2E test workflow (PR trigger, build, test, artifact upload)
- `playwright.config.ts` - Updated webServer command to use production build in CI
- `docs/CI_SETUP.md` - Documents 8 required GitHub Secrets and Clerk test account setup

## Decisions Made
- Playwright's webServer.command handles server startup automatically in CI -- no separate "start server" step needed in the workflow
- Upload artifact on `!cancelled()` (every run) rather than only on failure, for easier debugging
- Build step gets env vars for Next.js NEXT_PUBLIC_* inlining; run step gets all runtime env vars

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

**GitHub Secrets must be configured before CI E2E tests can pass.** See [docs/CI_SETUP.md](/docs/CI_SETUP.md) for:
- 8 required repository secrets (Clerk, DB, webhook, test accounts)
- Step-by-step Clerk test account creation
- GitHub Settings navigation

## Next Phase Readiness
- E2E testing phase complete (all 4 plans delivered)
- CI workflow ready to run once GitHub Secrets are configured
- Branch protection rules (Phase 16) can now require E2E status check

---
*Phase: 14-e2e-testing*
*Completed: 2026-01-30*
