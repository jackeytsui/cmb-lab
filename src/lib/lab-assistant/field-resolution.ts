// src/lib/lab-assistant/field-resolution.ts
// Self-healing resolution of the allowlisted GHL fields for the Lab
// Assistant. GHL custom field IDs differ per sub-account, so relying on
// manually mapped IDs alone breaks when the linked contact lives in another
// location (or mappings were never configured). Resolution order per concept:
//
//   1. Explicit mapping, matched by field ID (Admin → GHL → Field Mappings)
//   2. Explicit mapping, matched by field NAME via the contact location's
//      field catalog (covers mappings created against a different location)
//   3. Built-in name heuristics against the catalog ("Product END date" →
//      end_date), so the bot works with zero configuration
//
// Still strictly allowlist-scoped: only the five concepts ever resolve;
// everything else on the contact remains unreadable (default DENY).

import { db } from "@/db";
import { ghlFieldMappings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getGhlClientForLocation } from "@/lib/ghl/client";
import { getLocationForContact } from "@/lib/ghl/contacts";
import {
  ALLOWLISTED_FIELD_CONCEPTS,
  type AllowlistedFieldConcept,
} from "./allowlist";

export interface CatalogField {
  id: string;
  name: string;
}

/** Name heuristics per concept, tried in order (first match wins). */
export const CONCEPT_PATTERNS: Record<AllowlistedFieldConcept, RegExp[]> = {
  start_date: [/start\s*date/i, /date.*start/i],
  end_date: [/end\s*date/i, /date.*end/i],
  assigned_coach: [/coach/i],
  referral_source: [
    /referral.*source/i,
    /referred\s*by/i,
    /referral(?!.*status)/i,
  ],
  referral_status: [/referral.*status/i],
};

export function suggestField(
  concept: AllowlistedFieldConcept,
  fields: CatalogField[]
): CatalogField | null {
  for (const pattern of CONCEPT_PATTERNS[concept]) {
    const match = fields.find((f) => pattern.test(f.name));
    if (match) return match;
  }
  return null;
}

// In-memory catalog cache (per serverless instance) — field definitions
// change rarely; 10 minutes keeps GHL calls off the hot path.
const CATALOG_TTL_MS = 10 * 60 * 1000;
const catalogCache = new Map<
  string,
  { fields: CatalogField[]; expires: number }
>();

interface GhlCustomFieldsResponse {
  customFields: Array<{ id: string; name?: string; fieldKey?: string }>;
}

/** Custom field definitions (id + name) for a location, cached. */
export async function getLocationFieldCatalog(
  ghlLocationId: string
): Promise<CatalogField[]> {
  const cached = catalogCache.get(ghlLocationId);
  if (cached && cached.expires > Date.now()) return cached.fields;

  try {
    const client = await getGhlClientForLocation(ghlLocationId);
    if (!client) return cached?.fields ?? [];

    const response = await client.get<GhlCustomFieldsResponse>(
      `/locations/${ghlLocationId}/customFields`
    );
    const fields: CatalogField[] = (response.data.customFields ?? [])
      .filter((f) => f.id)
      .map((f) => ({ id: f.id, name: f.name || f.fieldKey || f.id }));

    catalogCache.set(ghlLocationId, {
      fields,
      expires: Date.now() + CATALOG_TTL_MS,
    });
    return fields;
  } catch (error) {
    console.error(
      "[Lab Assistant] Field catalog fetch failed:",
      error instanceof Error ? error.message : error
    );
    return cached?.fields ?? [];
  }
}

export type ResolutionSource = "mapping" | "mapping-name" | "auto" | null;

export interface AllowlistedFieldResolution {
  values: Record<AllowlistedFieldConcept, unknown>;
  /** How each concept resolved — surfaced in the audit trail for debugging. */
  via: Record<AllowlistedFieldConcept, ResolutionSource>;
}

/**
 * Resolve the five allowlisted concepts from a contact's custom field values.
 * Never throws; unresolvable concepts come back null/with via null.
 */
export async function resolveAllowlistedFields(
  ghlContactId: string,
  contactCustomFields: Array<{ id: string; value: unknown }>
): Promise<AllowlistedFieldResolution> {
  const values = Object.fromEntries(
    ALLOWLISTED_FIELD_CONCEPTS.map((c) => [c, null])
  ) as Record<AllowlistedFieldConcept, unknown>;
  const via = Object.fromEntries(
    ALLOWLISTED_FIELD_CONCEPTS.map((c) => [c, null])
  ) as Record<AllowlistedFieldConcept, ResolutionSource>;

  const valueByFieldId = new Map(
    contactCustomFields.map((f) => [f.id, f.value])
  );

  let mappings: Array<{
    lmsConcept: string;
    ghlFieldId: string;
    ghlFieldName: string;
  }> = [];
  try {
    mappings = await db
      .select({
        lmsConcept: ghlFieldMappings.lmsConcept,
        ghlFieldId: ghlFieldMappings.ghlFieldId,
        ghlFieldName: ghlFieldMappings.ghlFieldName,
      })
      .from(ghlFieldMappings)
      .where(eq(ghlFieldMappings.isActive, true));
  } catch (error) {
    console.error(
      "[Lab Assistant] Field mappings load failed:",
      error instanceof Error ? error.message : error
    );
  }
  const mappingByConcept = new Map(mappings.map((m) => [m.lmsConcept, m]));

  // The catalog is only needed for name-based fallbacks; load it lazily.
  let catalog: CatalogField[] | null = null;
  const loadCatalog = async (): Promise<CatalogField[]> => {
    if (catalog) return catalog;
    try {
      const locationId = await getLocationForContact(ghlContactId);
      catalog = locationId ? await getLocationFieldCatalog(locationId) : [];
    } catch {
      catalog = [];
    }
    return catalog;
  };

  for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
    const mapping = mappingByConcept.get(concept);

    // 1. Mapped field ID present on the contact
    if (mapping && valueByFieldId.has(mapping.ghlFieldId)) {
      values[concept] = valueByFieldId.get(mapping.ghlFieldId);
      via[concept] = "mapping";
      continue;
    }

    const fields = await loadCatalog();
    const fieldNameById = new Map(fields.map((f) => [f.id, f.name]));

    // 2. Mapped field NAME matched in this contact's location
    if (mapping) {
      const byName = contactCustomFields.find(
        (f) =>
          fieldNameById.get(f.id)?.trim().toLowerCase() ===
          mapping.ghlFieldName.trim().toLowerCase()
      );
      if (byName) {
        values[concept] = byName.value;
        via[concept] = "mapping-name";
        continue;
      }
    }

    // 3. Built-in heuristic against the location's catalog
    const contactFieldsWithNames: CatalogField[] = contactCustomFields
      .map((f) => ({ id: f.id, name: fieldNameById.get(f.id) ?? "" }))
      .filter((f) => f.name);
    const suggested = suggestField(concept, contactFieldsWithNames);
    if (suggested) {
      values[concept] = valueByFieldId.get(suggested.id);
      via[concept] = "auto";
    }
  }

  return { values, via };
}
