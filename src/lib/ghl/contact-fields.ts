// src/lib/ghl/contact-fields.ts
// GHL contact data fetch + cache service.
// Fetches contact data (tags, custom fields, timezone) from GHL API,
// caches in ghlContacts.cachedData with 5-minute TTL.

import { db } from "@/db";
import { ghlContacts, ghlFieldMappings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ghlClient } from "@/lib/ghl/client";
import type { GhlFieldMapping } from "@/db/schema";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface GhlContactApiResponse {
  contact: {
    id: string;
    tags: string[];
    customFields: Array<{ id: string; value: unknown }>;
    timezone?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
}

export interface GhlContactData {
  tags: string[];
  customFields: Array<{ id: string; value: unknown }>;
  timezone: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
}

export interface ResolvedField {
  lmsConcept: string;
  label: string;
  value: unknown;
}

export interface FetchResult {
  data: GhlContactData | null;
  lastFetchedAt: Date | null;
}

/**
 * Fetch GHL contact data for a user with 5-minute cache TTL.
 * Returns cached data if fresh, otherwise fetches from GHL API.
 * On fetch failure, returns stale cache if available (graceful degradation).
 */
export async function fetchGhlContactData(
  userId: string
): Promise<FetchResult> {
  // Look up ghlContacts row for userId
  const rows = await db
    .select({
      ghlContactId: ghlContacts.ghlContactId,
      cachedData: ghlContacts.cachedData,
      lastFetchedAt: ghlContacts.lastFetchedAt,
    })
    .from(ghlContacts)
    .where(eq(ghlContacts.userId, userId))
    .limit(1);

  if (rows.length === 0) {
    return { data: null, lastFetchedAt: null };
  }

  const { ghlContactId, cachedData, lastFetchedAt } = rows[0];

  // Check cache freshness
  if (cachedData && lastFetchedAt) {
    const age = Date.now() - lastFetchedAt.getTime();
    if (age < CACHE_TTL_MS) {
      return {
        data: cachedData as unknown as GhlContactData,
        lastFetchedAt,
      };
    }
  }

  // Cache stale or missing -- fetch from GHL
  try {
    const response = await ghlClient.get<GhlContactApiResponse>(
      `/contacts/${ghlContactId}`
    );

    const contact = response.data.contact;
    const freshData: GhlContactData = {
      tags: contact.tags ?? [],
      customFields: contact.customFields ?? [],
      timezone: contact.timezone ?? null,
      firstName: contact.firstName ?? null,
      lastName: contact.lastName ?? null,
      email: contact.email ?? null,
      phone: contact.phone ?? null,
    };

    // Update cache in database
    await db
      .update(ghlContacts)
      .set({
        cachedData: freshData as unknown as Record<string, unknown>,
        lastFetchedAt: new Date(),
      })
      .where(eq(ghlContacts.userId, userId));

    return { data: freshData, lastFetchedAt: new Date() };
  } catch (error) {
    console.error(
      `[GHL Contact Fields] Failed to fetch data for user ${userId}:`,
      error instanceof Error ? error.message : error
    );

    // Return stale cache if available (graceful degradation)
    if (cachedData) {
      return {
        data: cachedData as unknown as GhlContactData,
        lastFetchedAt,
      };
    }

    return { data: null, lastFetchedAt: null };
  }
}

/**
 * Force refresh GHL contact data, bypassing cache TTL.
 */
export async function refreshGhlContactData(
  userId: string
): Promise<FetchResult> {
  // Invalidate cache by clearing lastFetchedAt
  await db
    .update(ghlContacts)
    .set({ lastFetchedAt: null })
    .where(eq(ghlContacts.userId, userId));

  return fetchGhlContactData(userId);
}

/**
 * Resolve opaque GHL custom field IDs to human-readable labels using field mappings.
 * Returns only fields that have active mappings configured.
 */
export async function resolveCustomFields(
  customFields: Array<{ id: string; value: unknown }>,
  fieldMappings?: GhlFieldMapping[]
): Promise<ResolvedField[]> {
  // Fetch active field mappings if not provided
  const mappings =
    fieldMappings ??
    (await db
      .select()
      .from(ghlFieldMappings)
      .where(eq(ghlFieldMappings.isActive, true)));

  if (mappings.length === 0) {
    return [];
  }

  // Build a lookup map from GHL field ID -> mapping
  const mappingByGhlId = new Map(
    mappings.map((m) => [m.ghlFieldId, m])
  );

  const resolved: ResolvedField[] = [];
  for (const field of customFields) {
    const mapping = mappingByGhlId.get(field.id);
    if (mapping) {
      resolved.push({
        lmsConcept: mapping.lmsConcept,
        label: mapping.ghlFieldName,
        value: field.value,
      });
    }
  }

  return resolved;
}
