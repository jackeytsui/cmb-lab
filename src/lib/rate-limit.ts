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

// Helper to create a limiter or a mock fallback
function createLimiter(config: Omit<ConstructorParameters<typeof Ratelimit>[0], "redis">): Ratelimit {
  if (!redis) {
    // Mock limiter that allows everything
    return {
      limit: async () => ({ success: true, limit: 100, remaining: 100, reset: 0 }),
      blockUntilReady: async () => ({ success: true, limit: 100, remaining: 100, reset: 0 }),
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
