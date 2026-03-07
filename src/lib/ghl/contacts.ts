// src/lib/ghl/contacts.ts
// Contact linking service -- maps LMS users to GHL contacts via persistent ghlContactId

import { db } from "@/db";
import { ghlContacts, type GhlContact } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ghlClient, getGhlLocationId } from "@/lib/ghl/client";
import { logSyncEvent } from "@/lib/ghl/sync-logger";

interface GhlSearchResponse {
  contacts: Array<{
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }>;
}

interface FindOrLinkResult {
  ghlContactId: string;
  isNewLink: boolean;
}

/**
 * Find an existing GHL contact mapping or create one by searching GHL by email.
 * Throws if no GHL contact found for the given email.
 */
export async function findOrLinkContact(
  userId: string,
  email: string
): Promise<FindOrLinkResult> {
  // Check for existing active mapping
  const existing = await db
    .select()
    .from(ghlContacts)
    .where(eq(ghlContacts.userId, userId))
    .limit(1);

  if (existing.length > 0 && existing[0].syncStatus === "active") {
    await logSyncEvent({
      eventType: "contact.lookup",
      direction: "outbound",
      entityType: "contact",
      entityId: userId,
      ghlContactId: existing[0].ghlContactId,
    });
    return { ghlContactId: existing[0].ghlContactId, isNewLink: false };
  }

  // Search GHL for contact by email
  const locationId = getGhlLocationId();
  const response = await ghlClient.get<GhlSearchResponse>(
    `/contacts/search/duplicate?locationId=${locationId}&email=${encodeURIComponent(email)}`
  );

  const contacts = response.data.contacts;
  if (!contacts || contacts.length === 0) {
    throw new Error(`No GHL contact found for email ${email}`);
  }

  const ghlContactId = contacts[0].id;

  // Upsert mapping in ghl_contacts table
  await db
    .insert(ghlContacts)
    .values({
      userId,
      ghlContactId,
      ghlLocationId: locationId,
      syncStatus: "active",
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ghlContacts.userId,
      set: {
        ghlContactId,
        ghlLocationId: locationId,
        syncStatus: "active",
        lastSyncedAt: new Date(),
      },
    });

  await logSyncEvent({
    eventType: "contact.linked",
    direction: "outbound",
    entityType: "contact",
    entityId: userId,
    ghlContactId,
    payload: { email },
  });

  return { ghlContactId, isNewLink: true };
}

/**
 * Get the GHL contact ID for a user, or null if not linked.
 */
export async function getGhlContactId(
  userId: string
): Promise<string | null> {
  const rows = await db
    .select({ ghlContactId: ghlContacts.ghlContactId })
    .from(ghlContacts)
    .where(eq(ghlContacts.userId, userId))
    .limit(1);

  return rows.length > 0 ? rows[0].ghlContactId : null;
}

/**
 * Soft-unlink a user from their GHL contact (sets syncStatus to "disconnected").
 */
export async function unlinkContact(userId: string): Promise<void> {
  await db
    .update(ghlContacts)
    .set({ syncStatus: "disconnected" })
    .where(eq(ghlContacts.userId, userId));

  await logSyncEvent({
    eventType: "contact.unlinked",
    direction: "outbound",
    entityType: "contact",
    entityId: userId,
  });
}

/**
 * Get the full contact mapping row for a user.
 */
export async function getContactMapping(
  userId: string
): Promise<GhlContact | null> {
  const rows = await db
    .select()
    .from(ghlContacts)
    .where(eq(ghlContacts.userId, userId))
    .limit(1);

  return rows.length > 0 ? rows[0] : null;
}

/**
 * Update a linked GHL contact's email when the user changes their email in Clerk.
 * Fails silently if user is not linked to GHL or if the GHL API call fails.
 * This ensures the Clerk webhook always returns 200 OK.
 */
export async function updateGhlContactEmail(
  userId: string,
  newEmail: string
): Promise<void> {
  const ghlId = await getGhlContactId(userId);

  // User not linked to GHL -- nothing to sync
  if (!ghlId) {
    return;
  }

  try {
    const locationId = getGhlLocationId();

    // Push email update to GHL
    await ghlClient.put(`/contacts/${ghlId}`, {
      email: newEmail,
      locationId,
    });

    // Update local record
    await db
      .update(ghlContacts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(ghlContacts.userId, userId));

    await logSyncEvent({
      eventType: "contact.email_updated",
      direction: "outbound",
      entityType: "contact",
      entityId: userId,
      ghlContactId: ghlId,
      payload: { newEmail },
    });
  } catch (error) {
    // Log failure but do NOT throw -- email sync failure should not break the Clerk webhook
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[GHL] Failed to update email for contact ${ghlId}:`,
      errorMessage
    );

    await logSyncEvent({
      eventType: "contact.email_updated",
      direction: "outbound",
      entityType: "contact",
      entityId: userId,
      ghlContactId: ghlId,
      payload: { newEmail, error: errorMessage },
      status: "failed",
    }).catch(() => {
      // If even logging fails, just console.error -- never break the webhook
      console.error("[GHL] Failed to log sync event for email update failure");
    });
  }
}
