// src/lib/ghl/webhooks.ts
// WebhookDispatcher service -- builds typed payloads for outbound GHL webhook events,
// handles deduplication, contact resolution, delivery via GHL tag API + optional webhook URL,
// and retry-compatible event logging via sync_events.

import { db } from "@/db";
import { syncEvents, users } from "@/db/schema";
import { eq, and, inArray, gte } from "drizzle-orm";
import { getGhlClientForLocation } from "@/lib/ghl/client";
import { getGhlContactId, getLocationForContact, findOrLinkContact } from "@/lib/ghl/contacts";
import {
  logSyncEvent,
  markEventCompleted,
  markEventFailed,
} from "@/lib/ghl/sync-logger";
import { markOutboundChange } from "@/lib/ghl/echo-detection";
import type { SyncEvent } from "@/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WebhookEventType =
  | "module.completed"
  | "course.completed"
  | "lesson.milestone"
  | "student.inactive"
  | "feedback.sent";

export interface ModuleCompletedContext {
  moduleTitle: string;
  courseTitle: string;
  totalLessons: number;
}

export interface CourseCompletedContext {
  courseTitle: string;
  totalModules: number;
  totalLessons: number;
  completionDate: string; // ISO 8601
}

export interface MilestoneLessonContext {
  lessonTitle: string;
  moduleTitle: string;
  courseTitle: string;
}

export interface StudentInactiveContext {
  lastActiveAt: string; // ISO 8601
  daysSinceActive: number;
}

export interface FeedbackSentContext {
  lessonTitle: string;
  feedbackType: string;
  submissionId: string;
}

export interface WebhookPayload {
  eventType: WebhookEventType;
  timestamp: string; // ISO 8601
  student: {
    email: string;
    name: string;
    userId: string;
    ghlContactId: string;
  };
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Dispatch parameters
// ---------------------------------------------------------------------------

interface DispatchWebhookParams {
  userId: string;
  userEmail?: string;
  eventType: WebhookEventType;
  entityType: string;
  entityId: string;
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Core dispatcher
// ---------------------------------------------------------------------------

/**
 * Dispatch an outbound webhook event to GHL.
 *
 * Flow: dedup check -> contact resolution -> payload build -> log pending ->
 *       deliver -> mark complete/failed.
 *
 * Callers that already have the user email can pass `userEmail` to skip the
 * users table lookup.
 */
export async function dispatchWebhook(
  params: DispatchWebhookParams
): Promise<void> {
  const { userId, userEmail, eventType, entityType, entityId, context } =
    params;

  // Step 1: Duplicate check -- skip if a matching event was logged within the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const duplicates = await db
    .select({ id: syncEvents.id })
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.entityId, entityId),
        eq(syncEvents.eventType, eventType),
        eq(syncEvents.direction, "outbound"),
        inArray(syncEvents.status, ["completed", "pending"]),
        gte(syncEvents.createdAt, oneHourAgo)
      )
    )
    .limit(1);

  if (duplicates.length > 0) {
    return; // Already dispatched recently
  }

  // Step 2: Resolve GHL contact
  let ghlContactId = await getGhlContactId(userId);

  if (!ghlContactId) {
    // Attempt to link by looking up the user email
    let email = userEmail;
    if (!email) {
      const user = await db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      email = user[0]?.email;
    }

    if (email) {
      try {
        const results = await findOrLinkContact(userId, email);
        if (results.length > 0) {
          ghlContactId = results[0].ghlContactId;
        }
      } catch {
        // findOrLinkContact throws if no GHL contact found for email -- graceful skip
      }
    }
  }

  if (!ghlContactId) {
    // No GHL contact -- log skip and return
    await logSyncEvent({
      eventType,
      direction: "outbound",
      entityType,
      entityId,
      payload: { skipped: true, reason: "no_ghl_contact" },
      status: "completed",
    });
    return;
  }

  // Step 3: Build payload
  let email = userEmail;
  let name = "";

  if (!email) {
    const user = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    email = user[0]?.email ?? "";
    name = user[0]?.name ?? "";
  } else {
    // We have email but might not have name
    const user = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    name = user[0]?.name ?? "";
  }

  const payload: WebhookPayload = {
    eventType,
    timestamp: new Date().toISOString(),
    student: {
      email: email ?? "",
      name,
      userId,
      ghlContactId,
    },
    context,
  };

  // Step 4: Log sync_event with status "pending"
  const eventId = await logSyncEvent({
    eventType,
    direction: "outbound",
    entityType,
    entityId,
    ghlContactId,
    payload: payload as unknown as Record<string, unknown>,
    status: "pending",
  });

  // Step 5: Attempt delivery
  try {
    await deliverWebhook(payload, ghlContactId);
    // Step 6a: Mark completed
    await markEventCompleted(eventId);
  } catch (error) {
    // Step 6b: Mark failed
    const errorMessage =
      error instanceof Error ? error.message : "Unknown delivery error";
    await markEventFailed(eventId, errorMessage);
  }
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Deliver a webhook payload to GHL via tag addition + optional webhook URL.
 * Uses echo detection to prevent infinite loops.
 * Throws on failure so the caller can catch and mark as failed.
 */
export async function deliverWebhook(
  payload: WebhookPayload,
  ghlContactId: string
): Promise<void> {
  // Event tags keep lms: prefix to distinguish from user-created tags
  const tagName = `lms:${payload.eventType}`;

  // Mark outbound change for echo detection (best-effort)
  try {
    await markOutboundChange(ghlContactId, "tag", tagName);
  } catch {
    // Echo detection is best-effort -- don't block delivery
    console.warn(
      `[GHL Webhook] Echo detection failed for ${ghlContactId}, continuing delivery`
    );
  }

  // Get location-specific client for this contact
  const locationId = await getLocationForContact(ghlContactId);
  if (!locationId) {
    throw new Error(`No location found for GHL contact ${ghlContactId}`);
  }
  const client = await getGhlClientForLocation(locationId);
  if (!client) {
    throw new Error(`GHL location ${locationId} not found or inactive`);
  }

  // Add tag to GHL contact
  await client.post(`/contacts/${ghlContactId}/tags`, {
    tags: [tagName],
  });

  // Optionally POST full payload to a GHL incoming webhook URL
  const webhookUrl = process.env.GHL_WEBHOOK_URL;
  if (webhookUrl) {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(
        `GHL webhook URL returned ${response.status}: ${await response.text().catch(() => "Unknown error")}`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Re-delivery from stored event (for cron retry)
// ---------------------------------------------------------------------------

/**
 * Re-deliver a webhook from a stored sync_event record.
 * Used by the cron retry route to replay failed events.
 */
export async function deliverWebhookFromEvent(
  event: SyncEvent
): Promise<void> {
  const payload = event.payload as unknown as WebhookPayload;
  const ghlContactId = event.ghlContactId;

  if (!payload || !ghlContactId) {
    throw new Error(
      `Cannot re-deliver event ${event.id}: missing payload or ghlContactId`
    );
  }

  await deliverWebhook(payload, ghlContactId);
}
