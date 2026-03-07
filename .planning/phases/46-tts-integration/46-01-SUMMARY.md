---
phase: 46-tts-integration
plan: 01
subsystem: api
tags: [azure-tts, ssml, redis-cache, rate-limiting, audio, speech-synthesis]

# Dependency graph
requires:
  - phase: 44-reading-schema
    provides: database schema and dictionary data for character/word text input
provides:
  - POST /api/tts endpoint with auth, rate limiting, Redis cache, Azure TTS
  - SSML builder library with voice resolver, XML escaper, phoneme support
  - TTS rate limiters (30/min student, 90/min elevated)
  - Cache key builder with tiered TTL (7d/3d/24h by text length)
affects: [46-02 (useTTS hook), 48-character-popup, 49-reader-components]

# Tech tracking
tech-stack:
  added: []
  patterns: [azure-tts-rest-api, ssml-builder, redis-cache-aside-base64, tiered-ttl-by-content-length]

key-files:
  created:
    - src/lib/tts.ts
    - src/app/api/tts/route.ts
  modified:
    - src/lib/rate-limit.ts

key-decisions:
  - "Buffer to Uint8Array conversion required for NextResponse body type compatibility"
  - "createHash named import instead of default crypto import for ESM compatibility"
  - "5-second AbortController timeout for TTS (vs 20s for pronunciation assessment)"

patterns-established:
  - "TTS cache key format: tts:{language}:{voice}:{rate}:{md5(text)}"
  - "Tiered TTL: 7d for 1-2 chars, 3d for 3-6 chars, 24h for 7+ chars"
  - "X-Cache HIT/MISS header pattern for cache observability"
  - "Standard neural voices only (not HD) for SSML prosody support"

# Metrics
duration: 11min
completed: 2026-02-08
---

# Phase 46 Plan 01: TTS Core API Summary

**Azure TTS REST API endpoint with SSML builder, Redis cache-aside base64 caching, and role-based rate limiting for Mandarin/Cantonese speech synthesis**

## Performance

- **Duration:** 11 min
- **Started:** 2026-02-08T12:00:03Z
- **Completed:** 2026-02-08T12:11:23Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Complete TTS core library with 10 exports: SSML builders (plain + phoneme), voice resolver, XML escaper, cache key/TTL, Azure TTS fetch, and 3 types
- POST /api/tts endpoint with full auth/rate-limit/cache/error pipeline following existing grade-audio route pattern
- TTS rate limiters (30/min student, 90/min elevated) added to centralized rate-limit module using shared Redis instance
- Redis cache-aside pattern with base64 encoding and tiered TTL based on text length

## Task Commits

Each task was committed atomically:

1. **Task 1: Create TTS core library and rate limiters** - `84b7c9f` (feat)
2. **Task 2: Create POST /api/tts endpoint with cache-aside pattern** - `fbbbf04` (feat)

## Files Created/Modified
- `src/lib/tts.ts` - SSML builder, voice resolver, XML escaper, cache key/TTL, Azure TTS fetch (10 exports)
- `src/lib/rate-limit.ts` - Added ttsLimiter (30/min) and ttsLimiterElevated (90/min) using shared Redis instance
- `src/app/api/tts/route.ts` - POST handler: auth -> validate -> rate limit -> cache check -> Azure TTS -> cache set -> return MP3

## Decisions Made
- Used `createHash` named import from `crypto` instead of default import for ESM/TypeScript compatibility
- Wrapped `Buffer` in `new Uint8Array()` for `NextResponse` body to satisfy TypeScript strict typing (`Buffer` is not assignable to `BodyInit`)
- 5-second AbortController timeout for TTS (pronunciation uses 20s -- TTS is simpler and typically responds in <300ms)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed crypto import for ESM compatibility**
- **Found during:** Task 1 (TTS core library)
- **Issue:** `import crypto from "crypto"` fails with TS1192 "Module 'crypto' has no default export"
- **Fix:** Changed to `import { createHash } from "crypto"` named import
- **Files modified:** src/lib/tts.ts
- **Verification:** `npx tsc --noEmit src/lib/tts.ts` passes clean
- **Committed in:** 84b7c9f (Task 1 commit)

**2. [Rule 1 - Bug] Fixed Buffer type incompatibility with NextResponse**
- **Found during:** Task 2 (TTS API endpoint)
- **Issue:** `new NextResponse(audioBuffer)` where audioBuffer is `Buffer` fails TS2345 "Buffer not assignable to BodyInit"
- **Fix:** Wrapped with `new Uint8Array(audioBuffer)` in both cache-hit and cache-miss return paths
- **Files modified:** src/app/api/tts/route.ts
- **Verification:** `npx tsc --noEmit` passes clean, `npm run build` succeeds
- **Committed in:** fbbbf04 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - Azure Speech credentials (AZURE_SPEECH_KEY, AZURE_SPEECH_REGION) are already documented as a pending todo. Upstash Redis credentials are already configured.

## Next Phase Readiness
- TTS API endpoint ready for client-side consumption via useTTS hook (Plan 46-02)
- All exports typed and documented for downstream integration
- Rate limiting and caching infrastructure in place
- No blockers for next plan

## Self-Check: PASSED

All files exist, all commits verified:
- src/lib/tts.ts: FOUND
- src/lib/rate-limit.ts: FOUND
- src/app/api/tts/route.ts: FOUND
- Commit 84b7c9f: FOUND
- Commit fbbbf04: FOUND

---
*Phase: 46-tts-integration*
*Completed: 2026-02-08*
