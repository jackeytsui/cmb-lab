---
phase: 01
plan: 05
subsystem: access-control
tags: [api, dashboard, drizzle, clerk, access-control]
dependency-graph:
  requires: [01-01, 01-02]
  provides: [course-listing-api, dashboard-page]
  affects: [02-content-player, course-detail-pages]
tech-stack:
  added: []
  patterns: [server-component-db-query, access-tier-filtering]
key-files:
  created:
    - src/app/api/courses/route.ts
    - src/app/(dashboard)/dashboard/page.tsx
  modified: []
decisions:
  - id: direct-db-query
    choice: "Server component queries database directly instead of fetching own API"
    reason: "More efficient, no unnecessary HTTP round-trip"
metrics:
  duration: 3min
  completed: 2026-01-26
---

# Phase 01 Plan 05: Course Access Control Summary

**One-liner:** API and dashboard for user's accessible courses with access tier filtering and expiration handling.

## What Was Built

### 1. Course Listing API (`/api/courses`)

GET endpoint returning courses the authenticated user has valid access to:
- Joins `courseAccess` -> `users` -> `courses` tables
- Filters by user's clerkId, excludes deleted courses
- Excludes expired access grants (`expiresAt < now`)
- Returns course data with `accessTier` property

```typescript
// Key query logic
const userCourses = await db
  .select({...})
  .from(courseAccess)
  .innerJoin(users, eq(courseAccess.userId, users.id))
  .innerJoin(courses, eq(courseAccess.courseId, courses.id))
  .where(and(
    eq(users.clerkId, clerkId),
    isNull(courses.deletedAt),
    or(isNull(courseAccess.expiresAt), gt(courseAccess.expiresAt, new Date()))
  ));
```

### 2. Dashboard Page (`/dashboard`)

Server component displaying user's courses:
- Personalized greeting with user's name
- Responsive grid layout (1/2/3 columns)
- Course cards with thumbnail, title, description
- Access tier badges (Preview/Full Access)
- Empty state when no courses accessible
- Dark theme consistent with app

## Verification

| Criterion | Status |
|-----------|--------|
| API route exists at `/api/courses` | Verified |
| Dashboard page exists at `/dashboard` | Verified |
| Unauthenticated users get 401/redirect | Verified |
| Only accessible courses returned | Verified |
| Expired access grants excluded | Verified |
| Access tier displayed | Verified |
| Empty state shown when no courses | Verified |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| f5360a3 | feat | Create API route for user's accessible courses |
| 97b02e5 | feat | Create dashboard page showing user's courses |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Notes

- Server component queries database directly (no fetch to own API) for efficiency
- Both API route and dashboard use identical query logic
- Access tier enum from schema ensures type safety
- Expiration check uses `gt(expiresAt, new Date())` for runtime comparison

## Next Phase Readiness

Ready for Phase 02 (Content & Player):
- Course listing infrastructure in place
- Access tier available for content gating decisions
- Dashboard provides entry point to course detail pages
