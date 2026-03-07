---
phase: 38-production-hardening
plan: 01
subsystem: infra
tags: [next.js, csp, hsts, security-headers, clerk, build-fix, env-config]

# Dependency graph
requires:
  - phase: 37-app-shell
    provides: sidebar layout that dashboard pages render inside
provides:
  - Passing production build (force-dynamic on root + dashboard layouts)
  - Security headers (CSP, HSTS, Permissions-Policy) in next.config.ts
  - Complete .env.example with all 27 environment variables documented
affects: [38-02, 38-03, 38-04, 38-05, deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "force-dynamic layout export for Clerk-authenticated route groups"
    - "CSP header with dev/prod conditional (unsafe-eval for HMR)"
    - "Security headers in next.config.ts headers() function"

key-files:
  created: []
  modified:
    - src/app/(dashboard)/layout.tsx
    - src/app/layout.tsx
    - next.config.ts
    - .env.example

key-decisions:
  - "Added force-dynamic to root layout (not just dashboard) because ClerkProvider wraps all routes"
  - "CSP uses *.clerk.accounts.dev wildcard for dev instances, with comment to replace for production custom domains"
  - "Dev mode includes unsafe-eval in CSP for Next.js hot module reload"

patterns-established:
  - "force-dynamic on root layout: ClerkProvider requires publishableKey at render time, propagates to all child routes"
  - "CSP with service allowlists: Clerk, Mux, OpenAI, Upstash domains explicitly permitted"
  - ".env.example organized by service with source comments and generation commands"

# Metrics
duration: 7min
completed: 2026-02-07
---

# Phase 38 Plan 01: Build Fix, Security Headers, and Env Documentation Summary

**force-dynamic build fix for Clerk pages, CSP/HSTS/Permissions-Policy headers, and complete .env.example with 27 variables across 9 service sections**

## Performance

- **Duration:** 7 min
- **Started:** 2026-02-07T14:51:42Z
- **Completed:** 2026-02-07T14:58:20Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Build now passes successfully -- all dashboard and root-level pages render dynamically, eliminating the "Missing publishableKey" error
- Six security headers configured: X-Content-Type-Options, X-Frame-Options, Referrer-Policy (existing) + Content-Security-Policy, Strict-Transport-Security, Permissions-Policy (new)
- .env.example expanded from 10 variables / 34 lines to 27 variables / 140 lines with service-organized sections and source comments

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix build with force-dynamic export and add security headers** - `1245f71` (feat)
2. **Task 2: Document all environment variables in .env.example** - `e7a132c` (docs)

## Files Created/Modified
- `src/app/(dashboard)/layout.tsx` - Added `export const dynamic = "force-dynamic"` to prevent static generation of dashboard pages
- `src/app/layout.tsx` - Added `export const dynamic = "force-dynamic"` because ClerkProvider requires publishableKey at render time (deviation)
- `next.config.ts` - Added CSP (with Clerk/Mux/OpenAI/Upstash domains), HSTS (2-year max-age + preload), and Permissions-Policy (camera/microphone for voice AI)
- `.env.example` - Expanded to 27 variables across 9 sections: Database, Clerk, Mux, OpenAI, Upstash, n8n, GHL, Azure Speech, App Config

## Decisions Made
- **Root layout force-dynamic:** The plan instructed adding force-dynamic only to `(dashboard)/layout.tsx`, but `ClerkProvider` in the root layout causes the same build error on `_not-found` and other root-level pages. Added force-dynamic to root layout as well. Since all pages already use ClerkProvider, this has no performance impact -- they were already unable to be statically generated.
- **CSP wildcard for Clerk:** Used `*.clerk.accounts.dev` to cover development Clerk instances. Added comment instructing production replacement with custom domain.
- **unsafe-eval conditional:** Only included in dev mode via `process.env.NODE_ENV` check, keeping production CSP strict.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added force-dynamic to root layout.tsx**
- **Found during:** Task 1 (Build fix)
- **Issue:** Build still failed after adding force-dynamic to dashboard layout because `_not-found` page (outside dashboard group) is wrapped by root layout's ClerkProvider, which requires publishableKey at build time
- **Fix:** Added `export const dynamic = "force-dynamic"` to `src/app/layout.tsx` with explanatory comment
- **Files modified:** `src/app/layout.tsx`
- **Verification:** `npm run build` passes with all 63 static pages generated successfully
- **Committed in:** `1245f71` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential for build to pass. No scope creep -- ClerkProvider in root layout makes all pages inherently dynamic regardless.

## Issues Encountered
- Upstash Redis warnings appear during build (`Unable to find environment variable: UPSTASH_REDIS_REST_URL`) -- these are benign warnings from module-level Redis initialization and do not affect the build. They will disappear once Upstash credentials are configured in .env.local.

## User Setup Required
None - no new external service configuration required. Existing .env.local values continue to work. The updated .env.example serves as documentation for new deployments.

## Next Phase Readiness
- Build passes cleanly, unblocking all subsequent Phase 38 plans
- Security headers are complete and ready for production deployment
- Database indexes (38-02), loading states, and lint fixes can proceed independently

## Self-Check: PASSED

---
*Phase: 38-production-hardening*
*Completed: 2026-02-07*
