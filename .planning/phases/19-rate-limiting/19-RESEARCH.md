# Phase 19: Rate Limiting - Research

**Researched:** 2026-01-30
**Domain:** Serverless rate limiting with Upstash Redis
**Confidence:** HIGH

## Summary

This phase adds rate limiting to public-facing API endpoints to prevent abuse and cost overruns. The standard approach for serverless rate limiting on Vercel is the `@upstash/ratelimit` library backed by `@upstash/redis`. This is a connectionless, HTTP-based solution purpose-built for serverless environments where in-memory solutions fail (each invocation has no shared state).

The implementation involves creating a centralized rate limiting utility in `src/lib/rate-limit.ts` that exports pre-configured limiters for different endpoint categories (AI chat, grading, webhooks, admin). Each API route calls the appropriate limiter with a user/IP identifier. The existing Clerk middleware already runs on every request and provides the user role, which enables role-based elevated limits for coaches and admins.

Key architectural decision: rate limiting should be applied at the individual API route level (not in middleware) because different routes need different limits and identifiers (userId vs IP). The middleware approach would require complex route matching logic that duplicates what already exists in the route handlers.

**Primary recommendation:** Use `@upstash/ratelimit` with sliding window algorithm, centralized configuration in `src/lib/rate-limit.ts`, and per-route `withRateLimit` wrapper functions.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@upstash/ratelimit` | latest | Rate limiting algorithms (sliding window, fixed window, token bucket) | Purpose-built for serverless; HTTP-based, no TCP connections; official Upstash product |
| `@upstash/redis` | latest | Redis client for Upstash (HTTP-based) | Required by @upstash/ratelimit; connectionless design for serverless |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| N/A | - | No additional libraries needed | The two Upstash packages cover everything |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @upstash/ratelimit | Custom in-memory Map | Fails in serverless -- each invocation is isolated, no shared state |
| @upstash/ratelimit | rate-limiter-flexible + ioredis | Requires persistent TCP connections, incompatible with serverless/edge |
| Upstash Redis | Vercel KV | Vercel KV is built on Upstash Redis anyway; using Upstash directly is more portable |

**Installation:**
```bash
npm install @upstash/ratelimit @upstash/redis
```

**Environment variables:**
```
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   └── rate-limit.ts        # All rate limiter instances and helper functions
├── app/
│   └── api/
│       ├── chat/route.ts          # Uses aiChatLimiter (userId)
│       ├── grade/route.ts         # Uses gradingLimiter (userId)
│       ├── grade-audio/route.ts   # Uses gradingLimiter (userId)
│       └── webhooks/
│           └── enroll/route.ts    # Uses webhookLimiter (IP)
```

### Pattern 1: Centralized Rate Limit Configuration
**What:** Single file exports all rate limiter instances with per-route configs
**When to use:** Always -- avoids scattered Ratelimit instantiation across routes
**Example:**
```typescript
// src/lib/rate-limit.ts
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Single Redis instance shared by all limiters
const redis = Redis.fromEnv();

// AI Chat: 20 req/min for students, 60 req/min for coaches/admins
export const aiChatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ratelimit:chat",
  analytics: true,
});

export const aiChatLimiterElevated = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit:chat:elevated",
  analytics: true,
});

// Grading: 10 req/min for students, 30 req/min for coaches/admins
export const gradingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:grade",
  analytics: true,
});

export const gradingLimiterElevated = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:grade:elevated",
  analytics: true,
});

// Webhooks: 10 req/min per IP (no auth, IP-based)
export const webhookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:webhook",
  analytics: true,
});
```

### Pattern 2: Rate Limit Response Helper
**What:** Reusable function that checks rate limit and returns a 429 response with proper headers
**When to use:** In every rate-limited API route
**Example:**
```typescript
// src/lib/rate-limit.ts (continued)
import { NextResponse } from "next/server";

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  pending: Promise<unknown>;
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again shortly.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    }
  );
}
```

### Pattern 3: Per-Route Integration
**What:** Each route handler calls the limiter at the top before doing any work
**When to use:** Every rate-limited API route
**Example:**
```typescript
// src/app/api/chat/route.ts
import { auth } from "@clerk/nextjs/server";
import {
  aiChatLimiter,
  aiChatLimiterElevated,
  rateLimitResponse,
} from "@/lib/rate-limit";

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
    });
  }

  // Choose limiter based on role
  const role = sessionClaims?.metadata?.role || "student";
  const limiter = ["admin", "coach"].includes(role)
    ? aiChatLimiterElevated
    : aiChatLimiter;

  const result = await limiter.limit(userId);
  if (!result.success) {
    return rateLimitResponse(result);
  }

  // ... rest of handler
}
```

### Pattern 4: IP-Based Rate Limiting for Webhooks
**What:** Use IP address as identifier for unauthenticated endpoints
**When to use:** Webhook endpoints that use secret header auth instead of Clerk
**Example:**
```typescript
// src/app/api/webhooks/enroll/route.ts
import { webhookLimiter, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Rate limit by IP first (before any other processing)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? req.headers.get("x-real-ip")
    ?? "unknown";

  const result = await webhookLimiter.limit(ip);
  if (!result.success) {
    return rateLimitResponse(result);
  }

  // ... rest of handler (secret verification, etc.)
}
```

### Anti-Patterns to Avoid
- **In-memory rate limiting:** Using a Map or global variable -- resets on every cold start in serverless
- **Middleware-only rate limiting:** Puts all logic in middleware.ts with complex route matching; harder to maintain and test
- **Same limiter instance for all routes:** Prevents per-route configuration; one aggressive endpoint eats the budget for all
- **Forgetting `pending` promise:** The `pending` promise handles analytics submission; in Vercel, use `waitUntil` if available, or just `await` it
- **Hardcoding limits in routes:** Scatters configuration; makes it impossible to see all limits at a glance

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sliding window algorithm | Custom Redis MULTI/EXEC scripts | `Ratelimit.slidingWindow()` | Edge cases with window boundaries, atomic operations, race conditions |
| Distributed rate limiting | Custom Redis counter with TTL | `@upstash/ratelimit` | Handles multi-region, CRDT sync, ephemeral caching |
| 429 response formatting | Manual header construction | Shared `rateLimitResponse()` helper | Ensures consistent Retry-After headers across all endpoints |
| Redis connection management | Custom fetch-based Redis client | `@upstash/redis` with `Redis.fromEnv()` | Handles REST API, retries, error handling |

**Key insight:** Rate limiting looks trivially simple (count requests, reject if over limit) but distributed, serverless rate limiting has subtle race conditions, clock skew issues, and cold-start behaviors that `@upstash/ratelimit` handles internally.

## Common Pitfalls

### Pitfall 1: In-Memory Rate Limiting in Serverless
**What goes wrong:** Using a Map or module-level variable to count requests. Each serverless invocation may be a fresh instance, so the counter resets constantly.
**Why it happens:** Developers copy rate limiting examples from Express.js tutorials that assume a long-running process.
**How to avoid:** Always use Upstash Redis as the backing store. Never use in-memory counters.
**Warning signs:** Rate limits never trigger in production but work in dev (dev server is long-running).

### Pitfall 2: Missing IP Extraction for Unauthenticated Routes
**What goes wrong:** Using `req.ip` which may be undefined in some environments; or trusting a single header.
**Why it happens:** IP extraction varies by platform (Vercel uses x-forwarded-for, others use x-real-ip).
**How to avoid:** Check `x-forwarded-for` first (take first IP to avoid spoofed chains), fall back to `x-real-ip`, then to a fallback string.
**Warning signs:** All webhook requests appear to come from the same identifier.

### Pitfall 3: Not Awaiting the `pending` Promise
**What goes wrong:** Analytics data is lost; in some environments the function terminates before background work completes.
**Why it happens:** The `limit()` method returns immediately but defers analytics work.
**How to avoid:** Either `await result.pending` at the end of the handler, or use Vercel's `waitUntil(result.pending)` if available.
**Warning signs:** Analytics dashboard shows no data despite rate limiting working.

### Pitfall 4: Using the Same Prefix for Different Limiters
**What goes wrong:** Different rate limiters share Redis keys, causing incorrect counts.
**Why it happens:** Default prefix is `@upstash/ratelimit` for all instances.
**How to avoid:** Always set a unique `prefix` per limiter: `ratelimit:chat`, `ratelimit:grade`, `ratelimit:webhook`.
**Warning signs:** Hitting the chat rate limit also blocks grading requests.

### Pitfall 5: Retry-After Header Calculation
**What goes wrong:** Retry-After is 0 or negative, confusing clients.
**Why it happens:** The `reset` field from Upstash is a Unix timestamp in milliseconds; Retry-After header should be seconds.
**How to avoid:** Calculate `Math.ceil((result.reset - Date.now()) / 1000)` and ensure it is at least 1.
**Warning signs:** Clients immediately retry and get rate-limited again.

### Pitfall 6: Forgetting Elevated Limits Return Path
**What goes wrong:** Coaches/admins hit student-level rate limits.
**Why it happens:** Developer forgets to check role and select the elevated limiter.
**How to avoid:** Always check `sessionClaims?.metadata?.role` and select the appropriate limiter instance.
**Warning signs:** Admin users complain about rate limiting during normal usage.

## Code Examples

### Complete Rate Limit Module
```typescript
// src/lib/rate-limit.ts
// Source: @upstash/ratelimit official docs + project patterns
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

const redis = Redis.fromEnv();

// --- Limiter Instances ---

// AI Chat: 20/min students, 60/min elevated
export const aiChatLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ratelimit:chat",
  analytics: true,
});

export const aiChatLimiterElevated = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit:chat:elevated",
  analytics: true,
});

// Grading: 10/min students, 30/min elevated
export const gradingLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:grade",
  analytics: true,
});

export const gradingLimiterElevated = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:grade:elevated",
  analytics: true,
});

// Webhooks: 10/min per IP
export const webhookLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:webhook",
  analytics: true,
});

// --- Helpers ---

export function rateLimitResponse(result: {
  limit: number;
  remaining: number;
  reset: number;
}): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: "Too many requests. Please slow down and try again shortly.",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    }
  );
}

/** Extract client IP from request headers (Vercel/proxy-aware) */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Select limiter based on user role */
export function selectLimiter(
  role: string,
  standard: Ratelimit,
  elevated: Ratelimit
): Ratelimit {
  return ["admin", "coach"].includes(role) ? elevated : standard;
}
```

### Integrating into an Authenticated Route (Chat)
```typescript
// In src/app/api/chat/route.ts -- add at top of POST handler
import {
  aiChatLimiter,
  aiChatLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";

// Inside POST handler, after auth check:
const role = (sessionClaims?.metadata?.role as string) || "student";
const limiter = selectLimiter(role, aiChatLimiter, aiChatLimiterElevated);
const rl = await limiter.limit(userId);
if (!rl.success) {
  return rateLimitResponse(rl);
}
```

### Integrating into a Webhook Route (IP-based)
```typescript
// In src/app/api/webhooks/enroll/route.ts -- add at top of POST handler
import { webhookLimiter, rateLimitResponse, getClientIp } from "@/lib/rate-limit";

// Inside POST handler, BEFORE secret verification:
const ip = getClientIp(req);
const rl = await webhookLimiter.limit(ip);
if (!rl.success) {
  return rateLimitResponse(rl);
}
```

### Streaming Response Rate Limit (AI SDK)
```typescript
// For streaming endpoints like /api/chat that return streamText responses,
// the rate limit check happens BEFORE streaming starts.
// If rate-limited, return a standard JSON 429 response (not a stream).
// The AI SDK React hooks handle non-stream error responses gracefully.
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| In-memory rate limiting (express-rate-limit) | Distributed Redis-backed (@upstash/ratelimit) | 2022+ | Required for serverless; in-memory fails completely |
| Custom Redis Lua scripts | @upstash/ratelimit algorithms | 2022+ | No need to write/maintain sliding window logic |
| Single global rate limit | Per-route, per-role configuration | Best practice | Different endpoints have different abuse profiles |

**Deprecated/outdated:**
- `express-rate-limit`: Only works with long-running servers, not serverless
- Manual Redis INCR + EXPIRE: Race conditions, @upstash/ratelimit handles atomicity

## Open Questions

1. **Elevated limit multipliers**
   - What we know: Requirements say coaches/admins get "more requests" but do not specify exact multipliers
   - What's unclear: The exact elevated limits (3x is used as default in examples above)
   - Recommendation: Use 3x multiplier (60/min chat, 30/min grading for elevated). Easy to adjust later in the centralized config.

2. **Which additional routes need rate limiting beyond the three specified**
   - What we know: RATE-02 specifies chat and grading; RATE-03 specifies enrollment webhook
   - What's unclear: Whether other endpoints (notifications, search, submissions) also need limits
   - Recommendation: Start with the three specified routes. The pattern is easy to extend later.

3. **Upstash Redis pricing and free tier limits**
   - What we know: Upstash has a free tier with 10,000 commands/day
   - What's unclear: Whether this is sufficient for production usage with analytics enabled
   - Recommendation: Start with free tier; each rate limit check is ~2 Redis commands. Monitor usage.

## Sources

### Primary (HIGH confidence)
- Upstash ratelimit-js GitHub README - installation, algorithms, API, Next.js patterns
- Upstash official docs (upstash.com/docs/redis/sdks/ratelimit-ts/*) - methods, algorithms, features, getting started
- Existing codebase analysis - middleware.ts, chat/route.ts, grade/route.ts, webhooks/enroll/route.ts

### Secondary (MEDIUM confidence)
- Upstash pricing model and free tier (general knowledge, verify at console.upstash.com)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - @upstash/ratelimit is the de facto solution for serverless rate limiting, verified via official docs
- Architecture: HIGH - patterns derived from official examples and codebase analysis of existing route structure
- Pitfalls: HIGH - documented in official docs and well-known serverless patterns

**Research date:** 2026-01-30
**Valid until:** 2026-03-01 (stable library, infrequent breaking changes)
