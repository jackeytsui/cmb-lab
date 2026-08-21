// src/lib/ghl/contacts.ts
// Contact linking service -- maps LMS users to GHL contacts via persistent ghlContactId
// Supports multi-location: a user can be linked to contacts in multiple GHL sub-accounts

import { db } from "@/db";
import { ghlContacts, ghlLocations, type GhlContact } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  createGhlClient,
  getAnyActiveGhlLocation,
  getGhlClientForLocation,
} from "@/lib/ghl/client";
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
  ghlLocationId: string;
  isNewLink: boolean;
}

/**
 * Find or create GHL contact mappings across ALL active locations.
 * Searches each active ghlLocation for the email, links all matches.
 * Returns an array of linked contacts (one per location where found).
 */
export async function findOrLinkContact(
  userId: string,
  email: string
): Promise<FindOrLinkResult[]> {
  // Check for existing active mappings
  const existing = await db
    .select()
    .from(ghlContacts)
    .where(and(eq(ghlContacts.userId, userId), eq(ghlContacts.syncStatus, "active")));

  if (existing.length > 0) {
    await logSyncEvent({
      eventType: "contact.lookup",
      direction: "outbound",
      entityType: "contact",
      entityId: userId,
      ghlContactId: existing[0].ghlContactId,
      payload: { existingLinks: existing.length },
    });
    return existing.map((c) => ({
      ghlContactId: c.ghlContactId,
      ghlLocationId: c.ghlLocationId,
      isNewLink: false,
    }));
  }

  // Get all active locations; fall back to the legacy env credentials when
  // the ghl_locations table is empty (environments configured via env only).
  let locations: Array<{
    ghlLocationId: string;
    apiToken: string;
    name: string;
  }> = await db
    .select({
      ghlLocationId: ghlLocations.ghlLocationId,
      apiToken: ghlLocations.apiToken,
      name: ghlLocations.name,
    })
    .from(ghlLocations)
    .where(eq(ghlLocations.isActive, true));

  if (locations.length === 0) {
    const fallback = await getAnyActiveGhlLocation();
    if (fallback) locations = [fallback];
  }

  if (locations.length === 0) {
    throw new Error("No active GHL locations configured");
  }

  const results: FindOrLinkResult[] = [];
  const targetEmail = email.trim().toLowerCase();

  for (const location of locations) {
    try {
      const client = createGhlClient(location.apiToken);
      const response = await client.get<GhlSearchResponse>(
        `/contacts/search/duplicate?locationId=${location.ghlLocationId}&email=${encodeURIComponent(email)}`
      );

      let ghlContactId: string | null = response.data.contacts?.[0]?.id ?? null;

      // The duplicate-check endpoint is strict; fall back to a general
      // contact query and match the EMAIL exactly (case-insensitive) —
      // email is the student identifier, so only an exact email match may
      // ever link.
      if (!ghlContactId) {
        const query = await client.get<GhlSearchResponse>(
          `/contacts/?locationId=${location.ghlLocationId}&query=${encodeURIComponent(email)}&limit=20`
        );
        ghlContactId =
          (query.data.contacts ?? []).find(
            (contact) => contact.email?.trim().toLowerCase() === targetEmail
          )?.id ?? null;
      }

      if (!ghlContactId) {
        continue; // Not found in this location
      }

      // Upsert mapping
      await db
        .insert(ghlContacts)
        .values({
          userId,
          ghlContactId,
          ghlLocationId: location.ghlLocationId,
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
        eventType: "contact.linked",
        direction: "outbound",
        entityType: "contact",
        entityId: userId,
        ghlContactId,
        payload: { email, locationId: location.ghlLocationId, locationName: location.name },
      });

      results.push({
        ghlContactId,
        ghlLocationId: location.ghlLocationId,
        isNewLink: true,
      });
    } catch (error) {
      // Log failure for this location but continue to others
      console.error(
        `[GHL] Failed to search location ${location.name} (${location.ghlLocationId}):`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (results.length === 0) {
    // Name every location that was searched so a "not found" log pinpoints
    // whether the right sub-account is even connected to the app.
    const searched = locations
      .map((location) => `${location.name} (${location.ghlLocationId})`)
      .join(", ");
    throw new Error(
      `No GHL contact found for email ${email} in any active location. Searched: ${searched}`
    );
  }

  return results;
}

/**
 * List active GHL locations (id + name). Falls back to the legacy env
 * credentials when the ghl_locations table is empty. Never throws.
 */
export async function getActiveGhlLocations(): Promise<
  Array<{ ghlLocationId: string; name: string }>
> {
  try {
    const rows = await db
      .select({
        ghlLocationId: ghlLocations.ghlLocationId,
        name: ghlLocations.name,
      })
      .from(ghlLocations)
      .where(eq(ghlLocations.isActive, true));
    if (rows.length > 0) return rows;

    const fallback = await getAnyActiveGhlLocation();
    return fallback
      ? [{ ghlLocationId: fallback.ghlLocationId, name: fallback.name }]
      : [];
  } catch (error) {
    console.error(
      "[GHL] Failed to list active locations:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

/**
 * Get a single GHL contact ID for a user (first active link).
 * Backward-compatible helper for callers that expect a single contact.
 */
export async function getGhlContactId(
  userId: string
): Promise<string | null> {
  const rows = await db
    .select({ ghlContactId: ghlContacts.ghlContactId })
    .from(ghlContacts)
    .where(and(eq(ghlContacts.userId, userId), eq(ghlContacts.syncStatus, "active")))
    .orderBy(asc(ghlContacts.createdAt))
    .limit(1);

  return rows.length > 0 ? rows[0].ghlContactId : null;
}

/**
 * Get ALL GHL contact links for a user (one per location).
 * Used by tag sync to push to all linked locations.
 */
export async function getGhlContactLinks(
  userId: string
): Promise<Array<{ ghlContactId: string; ghlLocationId: string }>> {
  return db
    .select({
      ghlContactId: ghlContacts.ghlContactId,
      ghlLocationId: ghlContacts.ghlLocationId,
    })
    .from(ghlContacts)
    .where(and(eq(ghlContacts.userId, userId), eq(ghlContacts.syncStatus, "active")))
    .orderBy(asc(ghlContacts.createdAt));
}

/**
 * Get the location ID for a specific GHL contact.
 */
export async function getLocationForContact(
  ghlContactId: string
): Promise<string | null> {
  const rows = await db
    .select({ ghlLocationId: ghlContacts.ghlLocationId })
    .from(ghlContacts)
    .where(eq(ghlContacts.ghlContactId, ghlContactId))
    .limit(1);

  return rows.length > 0 ? rows[0].ghlLocationId : null;
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
 * Get all contact mapping rows for a user.
 */
export async function getContactMappings(
  userId: string
): Promise<GhlContact[]> {
  return db
    .select()
    .from(ghlContacts)
    .where(eq(ghlContacts.userId, userId));
}

/**
 * Get a single contact mapping for a user (backward compat).
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
 * Pushes to ALL linked locations.
 * Fails silently if user is not linked to GHL or if the GHL API call fails.
 */
export async function updateGhlContactEmail(
  userId: string,
  newEmail: string
): Promise<void> {
  const links = await getGhlContactLinks(userId);

  if (links.length === 0) return;

  for (const link of links) {
    try {
      const client = await getGhlClientForLocation(link.ghlLocationId);
      if (!client) continue;

      await client.put(`/contacts/${link.ghlContactId}`, {
        email: newEmail,
      });

      // Update local record
      await db
        .update(ghlContacts)
        .set({ lastSyncedAt: new Date() })
        .where(eq(ghlContacts.ghlContactId, link.ghlContactId));

      await logSyncEvent({
        eventType: "contact.email_updated",
        direction: "outbound",
        entityType: "contact",
        entityId: userId,
        ghlContactId: link.ghlContactId,
        payload: { newEmail, locationId: link.ghlLocationId },
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // A deleted/moved GHL contact leaves a stale local mapping. Disconnect
      // it once so future Clerk webhook deliveries do not retry the same
      // impossible update indefinitely.
      const contactNoLongerExists =
        errorMessage.includes("GHL API error 400") &&
        errorMessage.toLowerCase().includes("contact not found");
      if (contactNoLongerExists) {
        try {
          await db
            .update(ghlContacts)
            .set({ syncStatus: "disconnected" })
            .where(
              and(
                eq(ghlContacts.ghlContactId, link.ghlContactId),
                eq(ghlContacts.ghlLocationId, link.ghlLocationId),
              ),
            );

          console.warn(
            "[GHL] Disconnected a stale contact mapping after GHL reported the contact missing",
          );
          await logSyncEvent({
            eventType: "contact.unlinked",
            direction: "outbound",
            entityType: "contact",
            entityId: userId,
            ghlContactId: link.ghlContactId,
            payload: {
              locationId: link.ghlLocationId,
              reason: "contact_not_found",
            },
          });
        } catch {
          console.error("[GHL] Failed to disconnect or log a stale contact mapping");
        }
        continue;
      }

      console.error(
        `[GHL] Failed to update email for contact ${link.ghlContactId}:`,
        errorMessage
      );

      await logSyncEvent({
        eventType: "contact.email_updated",
        direction: "outbound",
        entityType: "contact",
        entityId: userId,
        ghlContactId: link.ghlContactId,
        payload: { newEmail, locationId: link.ghlLocationId, error: errorMessage },
        status: "failed",
      }).catch(() => {
        console.error("[GHL] Failed to log sync event for email update failure");
      });
    }
  }
}
