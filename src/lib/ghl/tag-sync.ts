// src/lib/ghl/tag-sync.ts
// Bidirectional tag sync between LMS and GHL.
// Outbound: LMS tag assignment -> GHL contact tag via API
// Inbound: GHL ContactTagUpdate webhook -> LMS tag assignment
// Echo detection prevents infinite sync loops.

import { db } from "@/db";
import { ghlContacts, tags } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ghlClient } from "@/lib/ghl/client";
import { getGhlContactId } from "@/lib/ghl/contacts";
import { markOutboundChange, isEchoWebhook } from "@/lib/ghl/echo-detection";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { assignTag, removeTag, createTag } from "@/lib/tags";

/**
 * Sync a tag change from LMS to GHL.
 * Call this fire-and-forget after assignTag/removeTag in API routes:
 *   syncTagToGhl(userId, tagName, "add").catch(console.error)
 *
 * Tag naming: coach tags are prefixed with `lms:` in GHL.
 * System tags sync without prefix.
 *
 * Throws on failure so the caller's .catch() can log the error.
 */
export async function syncTagToGhl(
  userId: string,
  tagName: string,
  action: "add" | "remove",
  options?: { tagType?: "coach" | "system" }
): Promise<void> {
  const ghlContactId = await getGhlContactId(userId);
  if (!ghlContactId) {
    // User not linked to GHL -- nothing to sync
    return;
  }

  // Coach tags get lms: prefix in GHL; system tags sync as-is
  const tagType = options?.tagType ?? "coach";
  const ghlTagName = tagType === "coach" ? `lms:${tagName}` : tagName;

  // Mark outbound change BEFORE the API call for echo detection
  await markOutboundChange(ghlContactId, "tag", ghlTagName);

  if (action === "add") {
    await ghlClient.post(`/contacts/${ghlContactId}/tags`, {
      tags: [ghlTagName],
    });
  } else {
    // GHL tag removal: DELETE /contacts/:contactId/tags/:tagName
    await ghlClient.delete(
      `/contacts/${ghlContactId}/tags/${encodeURIComponent(ghlTagName)}`
    );
  }

  await logSyncEvent({
    eventType: `tag.${action}`,
    direction: "outbound",
    entityType: "tag",
    entityId: ghlTagName,
    ghlContactId,
  });
}

/**
 * Convenience wrapper to sync tag removal from GHL.
 */
export async function syncTagRemovalFromGhl(
  userId: string,
  tagName: string,
  options?: { tagType?: "coach" | "system" }
): Promise<void> {
  return syncTagToGhl(userId, tagName, "remove", options);
}

/**
 * Process an inbound tag update from GHL webhook.
 * Diffs the full tag list against cached tags to find additions/removals.
 * Uses echo detection as a secondary safety net.
 * Tags synced inbound use source: "webhook" to prevent outbound echo.
 */
export async function processInboundTagUpdate(
  ghlContactId: string,
  currentGhlTags: string[]
): Promise<void> {
  // Find the LMS user linked to this GHL contact
  const contactRows = await db
    .select({
      userId: ghlContacts.userId,
      cachedData: ghlContacts.cachedData,
    })
    .from(ghlContacts)
    .where(eq(ghlContacts.ghlContactId, ghlContactId))
    .limit(1);

  if (contactRows.length === 0) {
    await logSyncEvent({
      eventType: "tag.inbound_skipped",
      direction: "inbound",
      entityType: "tag",
      ghlContactId,
      payload: { reason: "no_linked_user", tags: currentGhlTags },
    });
    return;
  }

  const { userId, cachedData } = contactRows[0];
  const cached = (cachedData as Record<string, unknown>) ?? {};
  const previousTags: string[] = (cached.tags as string[]) ?? [];

  // Diff: find additions and removals
  const addedTags = currentGhlTags.filter((t) => !previousTags.includes(t));
  const removedTags = previousTags.filter((t) => !currentGhlTags.includes(t));

  // Process additions
  for (const ghlTagName of addedTags) {
    // Check echo detection -- if this is our own outbound change echoing back, skip
    const isEcho = await isEchoWebhook(ghlContactId, "tag", ghlTagName);
    if (isEcho) {
      continue;
    }

    // Strip lms: prefix if present (these are LMS-originated tags)
    const tagName = ghlTagName.startsWith("lms:")
      ? ghlTagName.slice(4)
      : ghlTagName;

    // Find or create the tag in LMS
    let tag = await findTagByName(tagName);
    if (!tag) {
      // GHL-originated tag -- create as system type
      tag = await createTag({
        name: tagName,
        color: "#6b7280", // neutral gray for system tags
        type: "system",
        description: `Auto-created from GHL tag: ${ghlTagName}`,
      });
    }

    await assignTag(userId, tag.id, undefined, { source: "webhook" });

    await logSyncEvent({
      eventType: "tag.add",
      direction: "inbound",
      entityType: "tag",
      entityId: ghlTagName,
      ghlContactId,
      payload: { lmsTagId: tag.id, lmsTagName: tagName },
    });
  }

  // Process removals
  for (const ghlTagName of removedTags) {
    const isEcho = await isEchoWebhook(ghlContactId, "tag", ghlTagName);
    if (isEcho) {
      continue;
    }

    const tagName = ghlTagName.startsWith("lms:")
      ? ghlTagName.slice(4)
      : ghlTagName;

    const tag = await findTagByName(tagName);
    if (!tag) {
      continue; // Tag doesn't exist in LMS, nothing to remove
    }

    // Only auto-remove system (GHL-originated) tags. Do NOT remove coach tags.
    if (tag.type !== "system") {
      await logSyncEvent({
        eventType: "tag.remove_skipped",
        direction: "inbound",
        entityType: "tag",
        entityId: ghlTagName,
        ghlContactId,
        payload: { reason: "coach_tag_protected", lmsTagId: tag.id },
      });
      continue;
    }

    await removeTag(userId, tag.id, { source: "webhook" });

    await logSyncEvent({
      eventType: "tag.remove",
      direction: "inbound",
      entityType: "tag",
      entityId: ghlTagName,
      ghlContactId,
      payload: { lmsTagId: tag.id, lmsTagName: tagName },
    });
  }

  // Update cached tags to keep the diff baseline fresh
  await db
    .update(ghlContacts)
    .set({
      cachedData: { ...cached, tags: currentGhlTags },
    })
    .where(eq(ghlContacts.ghlContactId, ghlContactId));
}

// --- Internal helpers ---

async function findTagByName(
  name: string
): Promise<{ id: string; name: string; type: "coach" | "system" } | null> {
  const rows = await db
    .select({ id: tags.id, name: tags.name, type: tags.type })
    .from(tags)
    .where(eq(tags.name, name))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}
