// src/lib/ghl/echo-detection.ts
// Prevents infinite webhook loops by marking outbound changes with short TTL
// markers, then checking inbound webhooks against them. Redis is preferred
// when configured; Neon is the durable production fallback.
//
// Flow:
// 1. LMS updates GHL contact field -> markOutboundChange("contact123", "email", "new@example.com")
// 2. GHL fires webhook back to LMS -> isEchoWebhook("contact123", "email", "new@example.com")
// 3. Returns true (echo detected), deletes the marker, and skips processing

import { Redis } from "@upstash/redis";
import { createHash } from "node:crypto";
import { getNeonSql } from "@/db";

let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch (error) {
    console.warn(
      "Redis init failed in echo-detection; using Neon:",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
}

// TTL for echo markers (seconds) -- 60s is enough for GHL webhook round-trip
const ECHO_TTL_SECONDS = 60;
const localMarkers = new Map<string, number>();
let warnedAboutDatabaseFallback = false;

/**
 * Build a deterministic Redis key for an outbound change marker.
 */
function echoKey(
  contactId: string,
  changeType: string,
  changeValue: string
): string {
  const valueHash = createHash("sha256").update(changeValue).digest("hex");
  return `ghl:echo:${contactId}:${changeType}:${valueHash}`;
}

function markLocally(key: string): void {
  localMarkers.set(key, Date.now() + ECHO_TTL_SECONDS * 1000);
}

function consumeLocalMarker(key: string): boolean {
  const expiresAt = localMarkers.get(key);
  localMarkers.delete(key);
  return typeof expiresAt === "number" && expiresAt > Date.now();
}

function warnDatabaseFallback(error: unknown): void {
  if (warnedAboutDatabaseFallback) return;
  warnedAboutDatabaseFallback = true;
  console.warn(
    "Neon echo detection failed; using process-local protection:",
    error instanceof Error ? error.name : "UnknownError",
  );
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
  if (redis) {
    await redis.set(key, "1", { ex: ECHO_TTL_SECONDS });
    return;
  }

  try {
    const sql = getNeonSql();
    const expiresAt = new Date(Date.now() + ECHO_TTL_SECONDS * 1000);
    await sql`
      WITH cleanup AS (
        DELETE FROM "ghl_echo_markers" WHERE "expires_at" <= now()
      )
      INSERT INTO "ghl_echo_markers" ("key", "expires_at")
      VALUES (${key}, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE
      SET "expires_at" = EXCLUDED."expires_at"
    `;
  } catch (error) {
    warnDatabaseFallback(error);
    markLocally(key);
  }
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
  if (redis) {
    const exists = await redis.get(key);
    if (exists) {
      await redis.del(key);
      return true;
    }
    return false;
  }

  try {
    const sql = getNeonSql();
    // Delete and test in one statement so simultaneous webhook deliveries
    // cannot both consume the same marker.
    const rows = (await sql`
      DELETE FROM "ghl_echo_markers"
      WHERE "key" = ${key}
      RETURNING "expires_at" > now() AS "active"
    `) as Array<{ active: boolean }>;
    return rows[0]?.active === true;
  } catch (error) {
    warnDatabaseFallback(error);
    return consumeLocalMarker(key);
  }
}
