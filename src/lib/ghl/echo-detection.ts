// src/lib/ghl/echo-detection.ts
// Prevents infinite webhook loops by marking outbound changes in Redis
// with short TTL markers, then checking inbound webhooks against them.
//
// Flow:
// 1. LMS updates GHL contact field -> markOutboundChange("contact123", "email", "new@example.com")
// 2. GHL fires webhook back to LMS -> isEchoWebhook("contact123", "email", "new@example.com")
// 3. Returns true (echo detected), deletes the marker, and skips processing

import { Redis } from "@upstash/redis";

// Safely initialize Redis or fallback to mock
let redis: Redis;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  } else {
    throw new Error("Missing Upstash credentials");
  }
} catch (error) {
  console.warn("Redis init failed in echo-detection, using mock:", error);
  redis = {
    set: async () => "OK",
    get: async () => null,
    del: async () => 0,
  } as unknown as Redis;
}

// TTL for echo markers (seconds) -- 60s is enough for GHL webhook round-trip
const ECHO_TTL_SECONDS = 60;

/**
 * Build a deterministic Redis key for an outbound change marker.
 */
function echoKey(
  contactId: string,
  changeType: string,
  changeValue: string
): string {
  return `ghl:echo:${contactId}:${changeType}:${changeValue}`;
}

/**
 * Mark an outbound change so the inbound webhook can detect it as an echo.
 * Call this BEFORE sending the update to GHL.
 *
 * @param contactId - The GHL contact ID being updated
 * @param changeType - The type of change (e.g., "email", "tag", "custom_field")
 * @param changeValue - The new value (e.g., "user@example.com", "milestone-1")
 */
export async function markOutboundChange(
  contactId: string,
  changeType: string,
  changeValue: string
): Promise<void> {
  const key = echoKey(contactId, changeType, changeValue);
  await redis.set(key, "1", { ex: ECHO_TTL_SECONDS });
}

/**
 * Check if an inbound webhook is an echo of our own outbound change.
 * If it IS an echo, deletes the marker and returns true (caller should skip processing).
 * If it is NOT an echo, returns false (caller should process normally).
 *
 * @param contactId - The GHL contact ID from the webhook
 * @param changeType - The type of change from the webhook
 * @param changeValue - The value from the webhook
 * @returns true if this is an echo (skip processing), false if genuine external change
 */
export async function isEchoWebhook(
  contactId: string,
  changeType: string,
  changeValue: string
): Promise<boolean> {
  const key = echoKey(contactId, changeType, changeValue);
  const exists = await redis.get(key);

  if (exists) {
    // This is our own change echoing back -- delete the marker and signal skip
    await redis.del(key);
    return true;
  }

  return false;
}
