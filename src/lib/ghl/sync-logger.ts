// src/lib/ghl/sync-logger.ts
// Sync event logging service -- creates queryable audit trail for all GHL sync operations

import { db } from "@/db";
import { syncEvents, type SyncEvent } from "@/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";

interface LogSyncEventParams {
  eventType: string;
  direction: "inbound" | "outbound";
  entityType: string;
  entityId?: string;
  ghlContactId?: string;
  payload?: Record<string, unknown>;
  status?: "pending" | "processing" | "completed" | "failed";
}

/**
 * Log a sync event to the sync_events table.
 * Returns the event ID for later status updates.
 */
export async function logSyncEvent(
  event: LogSyncEventParams
): Promise<string> {
  const [row] = await db
    .insert(syncEvents)
    .values({
      eventType: event.eventType,
      direction: event.direction,
      entityType: event.entityType,
      entityId: event.entityId ?? null,
      ghlContactId: event.ghlContactId ?? null,
      payload: event.payload ?? {},
      status: event.status ?? "completed",
      processedAt: event.status === "completed" || !event.status ? new Date() : null,
    })
    .returning({ id: syncEvents.id });

  return row.id;
}

/**
 * Mark a sync event as completed.
 */
export async function markEventCompleted(eventId: string): Promise<void> {
  await db
    .update(syncEvents)
    .set({
      status: "completed",
      processedAt: new Date(),
    })
    .where(eq(syncEvents.id, eventId));
}

/**
 * Mark a sync event as failed with an error message.
 * Increments the retry count.
 */
export async function markEventFailed(
  eventId: string,
  errorMessage: string
): Promise<void> {
  await db
    .update(syncEvents)
    .set({
      status: "failed",
      errorMessage,
      retryCount: sql`${syncEvents.retryCount} + 1`,
    })
    .where(eq(syncEvents.id, eventId));
}

/**
 * Get recent sync events with optional filters.
 */
export async function getRecentSyncEvents(options: {
  limit?: number;
  direction?: "inbound" | "outbound";
  status?: string;
} = {}): Promise<SyncEvent[]> {
  const { limit = 50, direction, status } = options;

  const conditions = [];
  if (direction) {
    conditions.push(eq(syncEvents.direction, direction));
  }
  if (status) {
    conditions.push(eq(syncEvents.status, status as "pending" | "processing" | "completed" | "failed"));
  }

  const query = db
    .select()
    .from(syncEvents)
    .orderBy(desc(syncEvents.createdAt))
    .limit(limit);

  if (conditions.length > 0) {
    return query.where(and(...conditions));
  }

  return query;
}

/**
 * Get aggregated sync event stats for dashboard display.
 */
export async function getSyncEventStats(): Promise<{
  total: number;
  pending: number;
  failed: number;
  completed: number;
}> {
  const [stats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where ${syncEvents.status} = 'pending')::int`,
      failed: sql<number>`count(*) filter (where ${syncEvents.status} = 'failed')::int`,
      completed: sql<number>`count(*) filter (where ${syncEvents.status} = 'completed')::int`,
    })
    .from(syncEvents);

  return {
    total: stats?.total ?? 0,
    pending: stats?.pending ?? 0,
    failed: stats?.failed ?? 0,
    completed: stats?.completed ?? 0,
  };
}
