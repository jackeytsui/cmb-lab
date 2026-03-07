---
phase: 19-rate-limiting
plan: 01
subsystem: infrastructure
tags: [rate-limiting, upstash, redis, serverless]

dependency-graph:
  requires: []
  provides: [rate-limit-module, limiter-instances, rate-limit-helpers]
  affects: [19-02]

tech-stack:
  added: ["@upstash/ratelimit@2.0.8", "@upstash/redis@1.36.1"]
  patterns: ["centralized rate limit config", "sliding window algorithm", "role-based elevated limits"]

file-tracking:
  key-files:
    created: ["src/lib/rate-limit.ts"]
    modified: ["package.json"]

decisions:
  - id: RATE-01
    decision: "Sliding window algorithm for all limiters with unique Redis prefixes"
    reason: "Prevents key collisions and provides smooth rate limiting without burst edges"
  - id: RATE-02
    decision: "3x multiplier for elevated (coach/admin) limits"
    reason: "Research recommended 3x; easy to adjust in centralized config"

metrics:
  duration: 3min
  completed: 2026-01-30
---

# Phase 19 Plan 01: Rate Limit Infrastructure Summary

**One-liner:** Upstash Redis rate limiting module with 5 sliding-window limiters (chat/grading/webhook + elevated variants) and helper functions

## What Was Done

### Task 1: Install Upstash packages
- Installed `@upstash/ratelimit@2.0.8` and `@upstash/redis@1.36.1`
- Both packages are HTTP-based (no TCP connections), designed for serverless
- Commit: `e097755`

### Task 2: Create centralized rate limit module
- Created `src/lib/rate-limit.ts` with 8 named exports:
  - `aiChatLimiter` (20/min) and `aiChatLimiterElevated` (60/min)
  - `gradingLimiter` (10/min) and `gradingLimiterElevated` (30/min)
  - `webhookLimiter` (10/min per IP)
  - `rateLimitResponse()` -- returns 429 with Retry-After, X-RateLimit-* headers
  - `getClientIp()` -- extracts IP from x-forwarded-for/x-real-ip
  - `selectLimiter()` -- picks elevated limiter for admin/coach roles
- All limiters use `Ratelimit.slidingWindow` with unique prefixes
- `Math.max(1, ...)` prevents zero/negative Retry-After values
- Commit: `12f505e`

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| RATE-01 | Sliding window with unique prefixes per limiter | Avoids key collisions; smooth rate limiting |
| RATE-02 | 3x multiplier for elevated roles | Research recommendation; centralized and adjustable |

## Verification Results

1. `npm ls @upstash/ratelimit @upstash/redis` -- both packages present
2. `src/lib/rate-limit.ts` exports all 8 required symbols
3. `npx tsc --noEmit --project tsconfig.json` -- no errors in rate-limit.ts
4. All limiter prefixes unique: chat, chat:elevated, grade, grade:elevated, webhook
5. Retry-After uses `Math.max(1, ...)` to prevent zero/negative values

## Next Phase Readiness

**For 19-02 (Apply rate limiting to routes):**
- All limiter instances ready to import from `@/lib/rate-limit`
- Helper functions (rateLimitResponse, getClientIp, selectLimiter) available
- Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env vars to be set
