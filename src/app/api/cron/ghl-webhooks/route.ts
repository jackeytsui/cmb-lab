// src/app/api/cron/ghl-webhooks/route.ts
// Vercel cron route that retries failed outbound webhook deliveries with exponential backoff.
// Schedule: every 10 minutes (configured in vercel.json)

import { NextResponse } from "next/server";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { deliverWebhookFromEvent } from "@/lib/ghl/webhooks";
import {
  markEventCompleted,
  markEventFailed,
} from "@/lib/ghl/sync-logger";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Calculate cumulative backoff time in ms for a given retry count.
 * Uses exponential backoff: 4^i * 60s for each retry i.
 * Total wait before retry N = sum(4^i * 60000, i=0..N-1)
 */
function cumulativeBackoffMs(retryCount: number): number {
  let total = 0;
  for (let i = 0; i < retryCount; i++) {
    total += Math.pow(4, i) * 60_000;
  }
  return total;
}

export async function GET(request: Request) {
  // Step 1: Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[GHL Cron Retry] CRON_SECRET not set, skipping in development");
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Step 2: Query failed outbound events with retryCount < 5
  const failedEvents = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.direction, "outbound"),
        eq(syncEvents.status, "failed"),
        lt(syncEvents.retryCount, 5)
      )
    )
    .orderBy(syncEvents.createdAt)
    .limit(10);

  const stats = { retried: 0, succeeded: 0, failed: 0, skipped: 0 };

  // Step 3: Process each event with backoff check
  for (const event of failedEvents) {
    // Calculate whether enough time has elapsed for this retry
    const requiredElapsed = cumulativeBackoffMs(event.retryCount);
    const actualElapsed = Date.now() - event.createdAt.getTime();

    if (actualElapsed < requiredElapsed) {
      stats.skipped++;
      continue;
    }

    stats.retried++;

    try {
      await deliverWebhookFromEvent(event);
      await markEventCompleted(event.id);
      stats.succeeded++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown retry error";
      await markEventFailed(event.id, errorMessage);
      stats.failed++;
    }
  }

  return NextResponse.json(stats);
}
