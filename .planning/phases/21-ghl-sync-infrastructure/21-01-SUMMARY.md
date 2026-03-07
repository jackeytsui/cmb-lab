---
phase: 21-ghl-sync-infrastructure
plan: 01
subsystem: database, api
tags: [ghl, crm, drizzle, upstash, redis, rate-limiting, echo-detection, postgres]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: users table, Drizzle ORM setup, Neon database
  - phase: 19-rate-limiting
    provides: Upstash Redis and Ratelimit setup pattern
provides:
  - ghl_contacts table linking LMS users to GHL contacts (1:1)
  - sync_events table for audit log and event processing queue
  - ghl_field_mappings table for admin-configurable custom field mapping
  - Rate-limited GHL API client (80 req/10s burst, PIT auth)
  - Echo detection utilities (Redis TTL markers for webhook loop prevention)
  - ghlBurstLimiter rate limiter instance
affects: [21-02-webhook-endpoints, 21-03-contact-sync, 22-tag-sync, 23-field-sync, 24-admin-crm-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "GHL API client singleton with Upstash sliding window rate limiting"
    - "Echo detection via Redis TTL markers (60s) to prevent webhook loops"
    - "Event-sourced sync log (sync_events table as audit trail + queue)"

key-files:
  created:
    - src/db/schema/ghl.ts
    - src/lib/ghl/client.ts
    - src/lib/ghl/echo-detection.ts
    - src/db/migrations/0004_peaceful_bullseye.sql
  modified:
    - src/db/schema/index.ts
    - src/lib/rate-limit.ts

key-decisions:
  - "Used native fetch() inside GhlClient instead of GHL SDK -- avoids heavy dependency for simple PIT REST calls"
  - "80/10s burst limit (20% headroom from GHL's 100/10s) via Upstash sliding window"
  - "Echo detection uses deterministic Redis keys with 60s TTL -- sufficient for GHL webhook round-trip"
  - "Applied GHL tables via direct SQL instead of drizzle-kit migrate (pre-existing migration journal conflicts)"

patterns-established:
  - "GHL API client pattern: all calls through ghlClient singleton, never direct fetch()"
  - "Echo detection pattern: markOutboundChange before API call, isEchoWebhook in webhook handler"

# Metrics
duration: 13min
completed: 2026-01-31
---

# Phase 21 Plan 01: GHL Sync Infrastructure Foundation Summary

**Three GHL database tables (contacts, sync events, field mappings), rate-limited API client with Upstash burst limiting (80/10s), and Redis-based echo detection for webhook loop prevention**

## Performance

- **Duration:** 13 min
- **Started:** 2026-01-31T03:55:39Z
- **Completed:** 2026-01-31T04:08:33Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Three database tables deployed to Neon: ghl_contacts (user-to-contact linking), sync_events (audit/queue), ghl_field_mappings (admin-configurable)
- Rate-limited GHL API client with PIT authentication, exponential backoff retry, and rate limit header tracking
- Echo detection utilities using Redis TTL markers to prevent infinite webhook loops
- All types exportable from @/db/schema and all utilities from @/lib/ghl/*

## Task Commits

Each task was committed atomically:

1. **Task 1: GHL database schema and migration** - `4222333` (feat)
2. **Task 2: Rate-limited GHL API client and echo detection** - `2ba0fbd` (feat)

## Files Created/Modified
- `src/db/schema/ghl.ts` - Three tables (ghl_contacts, sync_events, ghl_field_mappings), two enums, relations, and type exports
- `src/db/schema/index.ts` - Barrel export for GHL schema
- `src/lib/ghl/client.ts` - GhlClient class with rate-limited get/post/put/delete, PIT auth, retry logic
- `src/lib/ghl/echo-detection.ts` - markOutboundChange and isEchoWebhook with Redis TTL markers
- `src/lib/rate-limit.ts` - Added ghlBurstLimiter (80 req/10s sliding window)
- `src/db/migrations/0004_peaceful_bullseye.sql` - Migration file for GHL tables

## Decisions Made
- Used native fetch() inside GhlClient instead of @gohighlevel/api-client SDK -- avoids heavy dependency for simple PIT REST calls
- Set 80/10s burst limit (20% headroom from GHL's documented 100/10s limit) via Upstash sliding window
- Echo detection uses deterministic Redis key pattern `ghl:echo:{contactId}:{changeType}:{changeValue}` with 60s TTL
- Applied tables via direct SQL (neon serverless driver) instead of drizzle-kit migrate due to pre-existing migration journal conflicts with legacy tables in the database

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied schema via direct SQL instead of drizzle-kit push/migrate**
- **Found during:** Task 1 (database migration)
- **Issue:** `drizzle-kit push` was interactive (asking about table renames for pre-existing legacy tables), and `drizzle-kit migrate` failed on already-existing enums from prior migrations
- **Fix:** Extracted GHL-specific DDL statements and ran them directly via @neondatabase/serverless driver with IF NOT EXISTS guards
- **Files modified:** No additional files (used existing migration SQL)
- **Verification:** Tables created successfully, TypeScript compiles cleanly
- **Committed in:** 4222333 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration approach changed but schema is identical. No scope creep.

## Issues Encountered
- DATABASE_URL not available in shell environment (only in .env.local) -- resolved by reading from .env.local inline
- drizzle-kit push interactive mode incompatible with automation when database has legacy tables -- resolved by direct SQL application

## User Setup Required
Environment variables needed for GHL integration:
- `GHL_API_TOKEN` - Private Integration Token from GHL settings
- `GHL_LOCATION_ID` - GHL sub-account location ID

## Next Phase Readiness
- Database schema ready for webhook endpoints (plan 21-02) and contact sync (plan 21-03)
- GHL API client ready for all outbound API calls
- Echo detection ready for webhook handler integration
- No blockers for subsequent plans

---
*Phase: 21-ghl-sync-infrastructure*
*Completed: 2026-01-31*
