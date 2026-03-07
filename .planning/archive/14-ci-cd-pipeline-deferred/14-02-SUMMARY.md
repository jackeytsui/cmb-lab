---
phase: 14-ci-cd-pipeline
plan: 02
subsystem: infra
tags: [neon, github-actions, drizzle, database, ci-cd, schema-diff]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: Drizzle ORM schema and migration setup
provides:
  - Neon DB branch creation on PR open
  - Neon DB branch cleanup on PR close
  - Schema diff comments on PRs modifying src/db/**
affects: [14-ci-cd-pipeline]

# Tech tracking
tech-stack:
  added: [neondatabase/create-branch-action@v6, neondatabase/delete-branch-action@v3, neondatabase/schema-diff-action@v1]
  patterns: [preview branch per PR, automated schema validation in CI]

key-files:
  created:
    - .github/workflows/db-branch-create.yml
    - .github/workflows/db-branch-cleanup.yml
    - .github/workflows/db-schema-check.yml
  modified: []

key-decisions:
  - "Branch naming convention preview/pr-N shared across all three workflows"
  - "Schema check workflow creates/reuses branch idempotently before running migrations"

patterns-established:
  - "Neon preview branches: preview/pr-{number} naming for isolated DB per PR"
  - "Schema safety: migrations run in CI before diff comparison"

# Metrics
duration: 3min
completed: 2026-01-30
---

# Phase 14 Plan 02: Neon DB Branch Lifecycle Summary

**Three GitHub Actions workflows for Neon DB branch lifecycle: create on PR open with migrations, cleanup on PR close, and schema diff comments on database changes**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-30T07:24:33Z
- **Completed:** 2026-01-30T07:27:33Z
- **Tasks:** 2
- **Files created:** 3

## Accomplishments
- PR open/reopen creates isolated Neon DB branch and runs Drizzle migrations
- PR close deletes Neon DB branch to prevent sprawl
- PRs modifying src/db/** trigger schema diff comment via neondatabase/schema-diff-action

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Neon DB branch create and cleanup workflows** - `b2e673b` (feat)
2. **Task 2: Create database schema diff workflow** - `bb9617b` (feat)

## Files Created/Modified
- `.github/workflows/db-branch-create.yml` - Creates Neon branch on PR open, runs migrations
- `.github/workflows/db-branch-cleanup.yml` - Deletes Neon branch on PR close
- `.github/workflows/db-schema-check.yml` - Posts schema diff on PRs touching src/db/**

## Decisions Made
- Branch naming convention `preview/pr-{number}` shared across all workflows for consistency
- Schema check workflow idempotently creates/reuses branch before running migrations and diff
- No `continue-on-error` on cleanup to surface failures visibly

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

The following GitHub repository configuration is needed:
- **Repository variable:** `NEON_PROJECT_ID` (Settings > Secrets and variables > Actions > Variables)
- **Repository secret:** `NEON_API_KEY` (Settings > Secrets and variables > Actions > Secrets)

## Next Phase Readiness
- Database CI workflows ready for use once Neon credentials are configured
- Complements other CI/CD workflows in phase 14

---
*Phase: 14-ci-cd-pipeline*
*Completed: 2026-01-30*
