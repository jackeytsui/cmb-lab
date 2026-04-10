// src/lib/ghl/tag-sync.ts
// Bidirectional tag sync between LMS and GHL.
// Outbound: LMS tag assignment -> GHL contact tag via API (all linked locations)
// Inbound: GHL ContactTagUpdate webhook -> LMS tag assignment (only for tags that exist in CMB Lab)
// Echo detection prevents infinite sync loops.
// No prefix: tags sync with their exact name across both platforms.

import { db } from "@/db";
import { ghlContacts, tags, users } from "@/db/schema";
import { eq, ilike } from "drizzle-orm";
import { getGhlClientForLocation } from "@/lib/ghl/client";
import { findOrLinkContact, getGhlContactLinks, getLocationForContact } from "@/lib/ghl/contacts";
import { markOutboundChange, isEchoWebhook } from "@/lib/ghl/echo-detection";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { assignTag, removeTag } from "@/lib/tags";

/**
 * Sync a tag change from LMS to GHL across ALL linked locations.
 * Call this fire-and-forget after assignTag/removeTag in API routes:
 *   syncTagToGhl(userId, tagName, "add").catch(console.error)
 *
 * Tags sync with their exact name — no prefix.
 */
export async function syncTagToGhl(
  userId: string,
  tagName: string,
  action: "add" | "remove"
): Promise<void> {
  const links = await getGhlContactLinks(userId);
  if (links.length === 0) return; // User not linked to any GHL location

  for (const link of links) {
    try {
      const client = await getGhlClientForLocation(link.ghlLocationId);
      if (!client) continue; // Location not found or inactive

      // Mark outbound change BEFORE the API call for echo detection
      await markOutboundChange(link.ghlContactId, "tag", tagName);

      if (action === "add") {
        await client.post(`/contacts/${link.ghlContactId}/tags`, {
          tags: [tagName],
        });
      } else {
        await client.delete(
          `/contacts/${link.ghlContactId}/tags/${encodeURIComponent(tagName)}`
        );
      }

      await logSyncEvent({
        eventType: `tag.${action}`,
        direction: "outbound",
        entityType: "tag",
        entityId: tagName,
        ghlContactId: link.ghlContactId,
        payload: { locationId: link.ghlLocationId },
      });
    } catch (error) {
      console.error(
        `[GHL Tag Sync] Failed to sync tag "${tagName}" ${action} to location ${link.ghlLocationId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }
}

/**
 * Convenience wrapper to sync tag removal from GHL.
 */
export async function syncTagRemovalFromGhl(
  userId: string,
  tagName: string
): Promise<void> {
  return syncTagToGhl(userId, tagName, "remove");
}

/**
 * Process an inbound tag update from GHL webhook.
 * Diffs the full tag list against cached tags to find additions/removals.
 * Only syncs tags that already exist in CMB Lab — unknown GHL tags are ignored.
 * Uses echo detection as a secondary safety net.
 * Tags synced inbound use source: "webhook" to prevent outbound echo.
 */
export async function processInboundTagUpdate(
  ghlContactId: string,
  currentGhlTags: string[],
  ghlLocationId?: string
): Promise<void> {
  // Find the LMS user linked to this GHL contact
  let contactRows = await db
    .select({
      userId: ghlContacts.userId,
      cachedData: ghlContacts.cachedData,
    })
    .from(ghlContacts)
    .where(eq(ghlContacts.ghlContactId, ghlContactId))
    .limit(1);

  // Reverse lookup: if no link exists, try to find an LMS user by email
  // (handles case where customer already had a CMB Lab account before checkout)
  if (contactRows.length === 0 && ghlLocationId) {
    const linked = await reverseLookupAndLink(ghlContactId, ghlLocationId);
    if (linked) {
      contactRows = await db
        .select({
          userId: ghlContacts.userId,
          cachedData: ghlContacts.cachedData,
        })
        .from(ghlContacts)
        .where(eq(ghlContacts.ghlContactId, ghlContactId))
        .limit(1);
    }
  }

  if (contactRows.length === 0) {
    await logSyncEvent({
      eventType: "tag.inbound_skipped",
      direction: "inbound",
      entityType: "tag",
      ghlContactId,
      payload: {
        reason: "no_linked_user_and_no_matching_email",
        tags: currentGhlTags,
        locationId: ghlLocationId,
      },
    });
    return;
  }

  const { userId, cachedData } = contactRows[0];
  const cached = (cachedData as Record<string, unknown>) ?? {};
  const previousTags: string[] = (cached.tags as string[]) ?? [];

  // Diff: find additions and removals
  const addedTags = currentGhlTags.filter((t) => !previousTags.includes(t));
  const removedTags = previousTags.filter((t) => !currentGhlTags.includes(t));

  // Process additions — only for tags that exist in CMB Lab
  for (const tagName of addedTags) {
    // Check echo detection
    const isEcho = await isEchoWebhook(ghlContactId, "tag", tagName);
    if (isEcho) {
      continue;
    }

    // Look up in CMB Lab — skip if not found (CMB Lab is master tag list)
    const tag = await findTagByName(tagName);
    if (!tag) {
      await logSyncEvent({
        eventType: "tag.inbound_skipped",
        direction: "inbound",
        entityType: "tag",
        entityId: tagName,
        ghlContactId,
        payload: { reason: "not_in_cmb_lab", tagName },
      });
      continue;
    }

    await assignTag(userId, tag.id, undefined, { source: "webhook" });

    await logSyncEvent({
      eventType: "tag.add",
      direction: "inbound",
      entityType: "tag",
      entityId: tagName,
      ghlContactId,
      payload: { lmsTagId: tag.id, lmsTagName: tagName },
    });
  }

  // Process removals — only for tags that exist in CMB Lab
  for (const tagName of removedTags) {
    const isEcho = await isEchoWebhook(ghlContactId, "tag", tagName);
    if (isEcho) {
      continue;
    }

    const tag = await findTagByName(tagName);
    if (!tag) {
      continue; // Tag doesn't exist in CMB Lab, nothing to remove
    }

    // Only auto-remove system (GHL-originated) tags. Do NOT remove coach tags.
    if (tag.type !== "system") {
      await logSyncEvent({
        eventType: "tag.remove_skipped",
        direction: "inbound",
        entityType: "tag",
        entityId: tagName,
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
      entityId: tagName,
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

/**
 * Link an LMS user to their GHL contact(s) across all active locations,
 * fetch their current tags from each linked contact, and apply any matching
 * CMB Lab tags to the student.
 *
 * Use cases:
 * - User signs up to CMB Lab with email already tagged in GHL (from checkout, etc.)
 * - Admin manually re-links an existing student
 * - GHL webhook reverse-lookup flow
 *
 * Returns summary stats for logging.
 */
export async function linkAndSyncTagsFromGhl(
  userId: string,
  email: string
): Promise<{
  linkedLocations: number;
  tagsApplied: number;
  tagsIgnored: number;
}> {
  const stats = { linkedLocations: 0, tagsApplied: 0, tagsIgnored: 0 };

  let links;
  try {
    links = await findOrLinkContact(userId, email);
  } catch (error) {
    // No contact found in any active location — nothing to sync
    await logSyncEvent({
      eventType: "contact.link_skipped",
      direction: "inbound",
      entityType: "contact",
      entityId: userId,
      payload: {
        reason: "no_ghl_contact_found",
        email,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    return stats;
  }

  stats.linkedLocations = links.length;

  // For each linked GHL contact, fetch current tags and apply matching ones
  for (const link of links) {
    try {
      const client = await getGhlClientForLocation(link.ghlLocationId);
      if (!client) continue;

      const response = await client.get<{
        contact: { tags?: string[] };
      }>(`/contacts/${link.ghlContactId}`);

      const ghlTags = response.data.contact.tags ?? [];

      for (const tagName of ghlTags) {
        const tag = await findTagByName(tagName);
        if (!tag) {
          stats.tagsIgnored++;
          continue;
        }

        // source: "webhook" prevents outbound echo (these tags are already in GHL)
        await assignTag(userId, tag.id, undefined, { source: "webhook" });
        stats.tagsApplied++;

        await logSyncEvent({
          eventType: "tag.add",
          direction: "inbound",
          entityType: "tag",
          entityId: tagName,
          ghlContactId: link.ghlContactId,
          payload: {
            reason: "link_sync",
            lmsTagId: tag.id,
            lmsTagName: tagName,
            locationId: link.ghlLocationId,
          },
        });
      }

      // Update cachedData so future webhook diffs have a fresh baseline
      await db
        .update(ghlContacts)
        .set({
          cachedData: { tags: ghlTags },
          lastFetchedAt: new Date(),
        })
        .where(eq(ghlContacts.ghlContactId, link.ghlContactId));
    } catch (error) {
      console.error(
        `[GHL Link Sync] Failed to fetch/apply tags for contact ${link.ghlContactId} in location ${link.ghlLocationId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return stats;
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

/**
 * Reverse lookup: given a GHL contact ID that isn't linked to any LMS user,
 * fetch the contact's email from GHL, find an LMS user with that email,
 * and create the link. Returns true if a link was created.
 *
 * Handles the checkout-before-signup flow where a customer already has a
 * CMB Lab account but triggered a new GHL contact tag update.
 */
async function reverseLookupAndLink(
  ghlContactId: string,
  ghlLocationId: string
): Promise<boolean> {
  try {
    const client = await getGhlClientForLocation(ghlLocationId);
    if (!client) return false;

    const response = await client.get<{
      contact: { email?: string };
    }>(`/contacts/${ghlContactId}`);

    const email = response.data.contact.email;
    if (!email) return false;

    // Find LMS user by email
    const userRows = await db
      .select({ id: users.id })
      .from(users)
      .where(ilike(users.email, email.trim().toLowerCase()))
      .limit(1);

    if (userRows.length === 0) {
      await logSyncEvent({
        eventType: "contact.reverse_lookup_miss",
        direction: "inbound",
        entityType: "contact",
        entityId: ghlContactId,
        payload: { email, locationId: ghlLocationId, reason: "no_lms_user_with_email" },
      });
      return false;
    }

    // Create the link
    await db
      .insert(ghlContacts)
      .values({
        userId: userRows[0].id,
        ghlContactId,
        ghlLocationId,
        syncStatus: "active",
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [ghlContacts.userId, ghlContacts.ghlLocationId],
        set: {
          ghlContactId,
          syncStatus: "active",
          lastSyncedAt: new Date(),
        },
      });

    await logSyncEvent({
      eventType: "contact.reverse_linked",
      direction: "inbound",
      entityType: "contact",
      entityId: userRows[0].id,
      ghlContactId,
      payload: { email, locationId: ghlLocationId },
    });

    return true;
  } catch (error) {
    console.error(
      `[GHL Reverse Lookup] Failed for contact ${ghlContactId} in location ${ghlLocationId}:`,
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
