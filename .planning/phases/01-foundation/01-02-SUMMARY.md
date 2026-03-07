---
phase: 01-foundation
plan: 02
subsystem: authentication
tags: [clerk, auth, middleware, webhooks, rbac, jwt]

# Dependency graph
requires: [01-01]
provides:
  - Clerk authentication with email/password sign up/in
  - Role-based access control (student/coach/admin)
  - Middleware route protection
  - Webhook handlers for user sync and external enrollment
affects: [02-enrollment, 03-courses, 04-progress, 05-coaching]

# Tech tracking
tech-stack:
  added: [@clerk/nextjs]
  patterns: [ClerkProvider wrapper, clerkMiddleware with route matchers, session claims for RBAC, webhook signature verification]

key-files:
  created:
    - src/app/layout.tsx (modified - added ClerkProvider)
    - src/types/globals.d.ts
    - src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    - src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
    - middleware.ts
    - src/lib/auth.ts
    - src/app/api/webhooks/clerk/route.ts
    - src/app/api/webhooks/enroll/route.ts
  modified:
    - package.json
    - .env.example

key-decisions:
  - "Used clerkMiddleware with createRouteMatcher for route protection"
  - "Role hierarchy: student < coach < admin with hasMinimumRole helper"
  - "Session claims via public_metadata (requires Clerk dashboard config)"
  - "External enrollment webhook creates Clerk user if not exists"

patterns-established:
  - "Auth pages in (auth) route group with catch-all segments"
  - "Middleware protects routes by role with redirect to /dashboard"
  - "Webhook signature verification before processing"
  - "Auth helpers in src/lib/auth.ts for server components"

# Metrics
duration: 7min
completed: 2026-01-26
---

# Phase 1 Plan 2: Clerk Authentication Summary

**Clerk auth with email/password, role-based middleware protection, webhooks for user sync and external enrollment**

## Performance

- **Duration:** 7 min 10 sec
- **Started:** 2026-01-26T11:54:03Z
- **Completed:** 2026-01-26T12:01:13Z
- **Tasks:** 3
- **Files created/modified:** 10

## Accomplishments

- Clerk SDK installed and ClerkProvider wrapping app with dark theme
- Sign-in and sign-up pages with Clerk components styled for dark mode
- Middleware protects routes by authentication and role (admin/coach/student)
- Auth helpers: checkRole, hasMinimumRole, getCurrentUser
- Clerk webhook syncs users to database on creation/update
- External enrollment webhook creates users and grants course access

## Task Commits

Each task was committed atomically:

1. **Task 1: Install Clerk and configure provider** - `e1bb4ad` (feat)
2. **Task 2: Create auth pages and middleware** - `c5af924` (feat)
3. **Task 3: Create webhook handlers** - `60ed060` (feat)

## Files Created/Modified

- `src/app/layout.tsx` - ClerkProvider wrapper, Inter font, dark theme
- `src/types/globals.d.ts` - Roles type, CustomJwtSessionClaims interface
- `src/app/(auth)/sign-in/[[...sign-in]]/page.tsx` - Sign-in page with dark styling
- `src/app/(auth)/sign-up/[[...sign-up]]/page.tsx` - Sign-up page with dark styling
- `middleware.ts` - Route protection with role-based access control
- `src/lib/auth.ts` - Auth utilities (checkRole, hasMinimumRole, getCurrentUser)
- `src/app/api/webhooks/clerk/route.ts` - Clerk webhook handler
- `src/app/api/webhooks/enroll/route.ts` - External enrollment webhook
- `package.json` - Added @clerk/nextjs dependency
- `.env.example` - Added Clerk and enrollment webhook env vars

## Decisions Made

1. **clerkMiddleware with createRouteMatcher** - Clean pattern for defining route groups (public, protected, admin, coach)
2. **Role hierarchy in hasMinimumRole** - Allows checking "at least coach" without listing all valid roles
3. **Session claims via public_metadata** - Requires Clerk dashboard configuration but provides clean access to role
4. **Enrollment webhook creates Clerk user** - External systems can enroll users who don't have accounts yet

## Deviations from Plan

None - plan executed exactly as written.

## User Setup Required

**External services require manual configuration.**

Before using authentication:

1. **Create Clerk application** at dashboard.clerk.com -> Add application
2. **Get API keys** from Clerk Dashboard -> API Keys:
   - Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - Copy `CLERK_SECRET_KEY`
3. **Configure session token** in Clerk Dashboard -> Sessions -> Customize session token:
   - Add: `{"metadata": "{{user.public_metadata}}"}`
   - **This is required for role-based access control to work**
4. **Create webhook endpoint** in Clerk Dashboard -> Webhooks:
   - URL: `https://your-domain/api/webhooks/clerk`
   - Events: `user.created`, `user.updated`
   - Copy signing secret to `CLERK_WEBHOOK_SECRET`
5. **Generate enrollment secret** for external systems:
   - Set `ENROLLMENT_WEBHOOK_SECRET` to a secure random string
   - Share with payment provider/external enrollment system
6. **Create `.env` file** with all keys from `.env.example`

## Next Phase Readiness

- Authentication ready for protected course pages (plan 02-enrollment)
- Role-based middleware protects admin and coach routes
- User sync webhook ensures database stays in sync with Clerk
- Enrollment webhook ready for external course purchases
- Note: Build requires DATABASE_URL to be configured (from plan 01-01)

---
*Phase: 01-foundation*
*Completed: 2026-01-26*
