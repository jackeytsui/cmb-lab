// src/lib/rate-limit.ts
// Centralized rate limiting configuration using Upstash Redis
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getNeonSql } from "@/db";
import { isStaffRole } from "@/lib/platform-roles";

// Safely initialize Redis (returns undefined if env vars are missing)
let redis: Redis | undefined;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch (error) {
    console.warn("Failed to initialize Redis client:", error);
  }
}

type WindowDuration = "1 m" | "10 s";

interface LimiterDefinition {
  requests: number;
  window: WindowDuration;
  windowMs: number;
  prefix: string;
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

const localWindows = new Map<string, { count: number; reset: number }>();
let warnedAboutDatabaseFallback = false;

function resultForCount(
  count: number,
  maxRequests: number,
  reset: number,
): RateLimitResult {
  return {
    success: count <= maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - count),
    reset,
  };
}

function consumeLocalWindow(
  key: string,
  maxRequests: number,
  reset: number,
): RateLimitResult {
  const existing = localWindows.get(key);
  const count = existing && existing.reset === reset ? existing.count + 1 : 1;
  localWindows.set(key, { count, reset });
  return resultForCount(count, maxRequests, reset);
}

export async function consumeDatabaseRateLimit(
  definition: Pick<LimiterDefinition, "requests" | "windowMs" | "prefix">,
  identifier: string,
  nowMs = Date.now(),
): Promise<RateLimitResult> {
  const windowStart = Math.floor(nowMs / definition.windowMs) * definition.windowMs;
  const reset = windowStart + definition.windowMs;
  const identifierHash = createHash("sha256").update(identifier).digest("hex");
  const key = `${definition.prefix}:${windowStart}:${identifierHash}`;

  try {
    const sql = getNeonSql();
    const rows = (await sql`
      WITH cleanup AS (
        DELETE FROM "api_rate_limit_windows" WHERE "expires_at" <= now()
      ), bumped AS (
        INSERT INTO "api_rate_limit_windows" ("key", "request_count", "expires_at")
        VALUES (${key}, 1, ${new Date(reset)})
        ON CONFLICT ("key") DO UPDATE
        SET "request_count" = "api_rate_limit_windows"."request_count" + 1
        RETURNING "request_count"
      )
      SELECT "request_count" FROM bumped
    `) as Array<{ request_count: number | string }>;
    const count = Number(rows[0]?.request_count ?? 1);
    return resultForCount(count, definition.requests, reset);
  } catch (error) {
    if (!warnedAboutDatabaseFallback) {
      warnedAboutDatabaseFallback = true;
      console.warn(
        "Database rate limiting failed; using process-local protection:",
        error instanceof Error ? error.name : "UnknownError",
      );
    }
    return consumeLocalWindow(key, definition.requests, reset);
  }
}

function createLimiter(definition: LimiterDefinition): Ratelimit {
  if (redis) {
    return new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(definition.requests, definition.window),
      prefix: definition.prefix,
      analytics: true,
    });
  }

  const limit = (identifier: string) =>
    consumeDatabaseRateLimit(definition, identifier);
  return {
    limit,
    blockUntilReady: limit,
  } as unknown as Ratelimit;
}

// --- Limiter Instances ---

// AI Chat: 20/min students, 60/min elevated (coaches/admins)
export const aiChatLimiter = createLimiter({
  requests: 20,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:chat",
});

export const aiChatLimiterElevated = createLimiter({
  requests: 60,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:chat:elevated",
});

// Lab Assistant (support bot): 15/min students, 45/min elevated
export const labAssistantLimiter = createLimiter({
  requests: 15,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:lab-assistant",
});

export const labAssistantLimiterElevated = createLimiter({
  requests: 45,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:lab-assistant:elevated",
});

// Grading: 10/min students, 30/min elevated (coaches/admins)
export const gradingLimiter = createLimiter({
  requests: 10,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:grade",
});

export const gradingLimiterElevated = createLimiter({
  requests: 30,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:grade:elevated",
});

// GHL outbound API: 80/10s (leaves 20% headroom from 100/10s burst limit)
export const ghlBurstLimiter = createLimiter({
  requests: 80,
  window: "10 s",
  windowMs: 10_000,
  prefix: "ratelimit:ghl:burst",
});

// TTS: 30/min students, 90/min elevated (coaches/admins)
// Higher than grading (10/min) because hover-to-hear generates rapid requests
export const ttsLimiter = createLimiter({
  requests: 30,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:tts",
});

export const ttsLimiterElevated = createLimiter({
  requests: 90,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:tts:elevated",
});

// Webhooks: 10/min per IP (no auth, IP-based)
export const webhookLimiter = createLimiter({
  requests: 10,
  window: "1 m",
  windowMs: 60_000,
  prefix: "ratelimit:webhook",
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
  return isStaffRole(role) ? elevated : standard;
}
