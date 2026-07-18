// src/lib/rate-limit.ts
// Centralized rate limiting configuration using Upstash Redis
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

// Safely initialize Redis (returns undefined if env vars are missing)
let redis: Redis | undefined;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch (error) {
    console.warn("Failed to initialize Redis client:", error);
  }
}

// Helper to create a limiter or a fallback when Redis is unconfigured.
// In production we FAIL CLOSED: without Redis there is no cost governor at all,
// so allowing everything would let a single user drain the OpenAI/Azure bill.
// In development we stay permissive so local work isn't blocked.
function createLimiter(config: Omit<ConstructorParameters<typeof Ratelimit>[0], "redis">): Ratelimit {
  if (!redis) {
    const failClosed = process.env.NODE_ENV === "production";
    if (failClosed) {
      console.error(
        "Rate limiting is UNCONFIGURED in production (missing UPSTASH_REDIS_* env). " +
          "Failing closed to protect AI spend. Configure Upstash Redis to restore service."
      );
    }
    const allow = !failClosed;
    return {
      limit: async () => ({ success: allow, limit: 0, remaining: 0, reset: Date.now() + 60_000 }),
      blockUntilReady: async () => ({ success: allow, limit: 0, remaining: 0, reset: Date.now() + 60_000 }),
    } as unknown as Ratelimit;
  }
  return new Ratelimit({ redis, ...config });
}

// --- Limiter Instances ---

// AI Chat: 20/min students, 60/min elevated (coaches/admins)
export const aiChatLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(20, "1 m"),
  prefix: "ratelimit:chat",
  analytics: true,
});

export const aiChatLimiterElevated = createLimiter({
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit:chat:elevated",
  analytics: true,
});

// Lab Assistant (support bot): 15/min students, 45/min elevated
export const labAssistantLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(15, "1 m"),
  prefix: "ratelimit:lab-assistant",
  analytics: true,
});

export const labAssistantLimiterElevated = createLimiter({
  limiter: Ratelimit.slidingWindow(45, "1 m"),
  prefix: "ratelimit:lab-assistant:elevated",
  analytics: true,
});

// Grading: 10/min students, 30/min elevated (coaches/admins)
export const gradingLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:grade",
  analytics: true,
});

export const gradingLimiterElevated = createLimiter({
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:grade:elevated",
  analytics: true,
});

// GHL outbound API: 80/10s (leaves 20% headroom from 100/10s burst limit)
export const ghlBurstLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(80, "10 s"),
  prefix: "ratelimit:ghl:burst",
  analytics: true,
});

// TTS: 30/min students, 90/min elevated (coaches/admins)
// Higher than grading (10/min) because hover-to-hear generates rapid requests
export const ttsLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(30, "1 m"),
  prefix: "ratelimit:tts",
  analytics: true,
});

export const ttsLimiterElevated = createLimiter({
  limiter: Ratelimit.slidingWindow(90, "1 m"),
  prefix: "ratelimit:tts:elevated",
  analytics: true,
});

// Realtime voice (OpenAI Realtime API): the most expensive surface in the app.
// A voice session bills continuously, so cap how often a user can mint one.
// 5/min students, 15/min elevated.
export const realtimeLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  prefix: "ratelimit:realtime",
  analytics: true,
});

export const realtimeLimiterElevated = createLimiter({
  limiter: Ratelimit.slidingWindow(15, "1 m"),
  prefix: "ratelimit:realtime:elevated",
  analytics: true,
});

// Webhooks: 10/min per IP (no auth, IP-based)
export const webhookLimiter = createLimiter({
  limiter: Ratelimit.slidingWindow(10, "1 m"),
  prefix: "ratelimit:webhook",
  analytics: true,
});

// --- Helpers ---

/** Build a 429 response with proper rate limit headers */
export function rateLimitResponse(result: {
  limit: number;
  remaining: number;
  reset: number;
}): NextResponse {
  const retryAfter = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000)
  );
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

/** Select limiter based on user role (elevated for admin/coach) */
export function selectLimiter(
  role: string,
  standard: Ratelimit,
  elevated: Ratelimit
): Ratelimit {
  return ["admin", "coach"].includes(role) ? elevated : standard;
}
