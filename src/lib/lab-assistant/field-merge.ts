// src/lib/lab-assistant/field-merge.ts
// Pure helpers for reading the RIGHT data per student:
//   - name heuristics for the allowlisted GHL field concepts
//   - value normalization (GHL date fields arrive as epoch millis, ISO
//     datetimes, or plain strings depending on the sub-account)
//   - merging field resolutions across a student's linked contacts, so the
//     assistant answers from whichever GHL location actually holds the data
//
// No db/server imports here — this module is unit-testable and reusable by
// the seed script and admin tooling.

import {
  ALLOWLISTED_FIELD_CONCEPTS,
  type AllowlistedFieldConcept,
} from "./allowlist";

export interface CatalogField {
  id: string;
  name: string;
}

/**
 * Name heuristics per concept, tried in order (first match wins), so the
 * most specific pattern is checked against the WHOLE catalog before a
 * broader fallback runs — matching stays correct regardless of the order
 * GHL returns fields in. Verified against the real Course sub-account field
 * names ("Product Start Date", "Product END date", "Coach name") alongside
 * their look-alikes ("CMS trial start date", "1 on 1 End Date",
 * "1on1 coaching fathom link").
 */
export const CONCEPT_PATTERNS: Record<AllowlistedFieldConcept, RegExp[]> = {
  start_date: [
    /product\s*start\s*date/i,
    /program\s*start\s*date/i,
    /start\s*date/i,
    /date.*start/i,
  ],
  end_date: [
    /product\s*end\s*date/i,
    /program\s*end\s*date/i,
    /end\s*date/i,
    /date.*end/i,
  ],
  assigned_coach: [
    /^coach\s*name$/i,
    /assigned\s*coach/i,
    /coach\s*name/i,
    /coach(?!ing)/i,
  ],
  referral_source: [
    /referral.*source/i,
    /referred\s*by/i,
    // Never match referral bookkeeping fields: "Referral - email" holds the
    // referred person's email (someone else's data — must not surface).
    /referral(?!.*(status|email|link))/i,
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

/** How a concept's value was found — surfaced in the audit trail. */
export type ResolutionSource = "mapping" | "mapping-name" | "auto" | null;

/**
 * The program's system of record is the "Course" sub-account ("The Canto to
 * Mando Blueprint Course"), not the marketing sub-account ("The Canto to
 * Mando Blueprint"). Locations whose name matches this pattern are always
 * preferred as the student's primary record.
 */
export const PREFERRED_LOCATION_NAME_PATTERN = /course/i;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

/**
 * Render an ISO date (YYYY-MM-DD) as human language ("May 12, 2026").
 * Non-date text passes through unchanged so the model never sees raw codes.
 */
export function formatHumanDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const [, year, month, day] = match;
  const monthName = MONTHS[Number(month) - 1];
  if (!monthName) return value;
  return `${monthName} ${Number(day)}, ${year}`;
}

const DATE_CONCEPTS: ReadonlySet<AllowlistedFieldConcept> = new Set([
  "start_date",
  "end_date",
] as const);

function epochToIsoDate(epoch: number): string | null {
  // Accept seconds (10-digit era) or milliseconds (13-digit era).
  const ms = epoch < 1e12 ? epoch * 1000 : epoch;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2200) return null; // clearly not a program date
  return date.toISOString().slice(0, 10);
}

/**
 * Normalize a raw GHL custom-field value into text the model can state
 * verbatim. Date concepts become YYYY-MM-DD regardless of whether GHL
 * returned epoch millis, epoch seconds, or an ISO datetime; multi-value
 * fields join with ", ". Empty/unset values become null.
 */
export function normalizeFieldValue(
  concept: AllowlistedFieldConcept,
  value: unknown
): string | null {
  if (value === null || value === undefined) return null;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => normalizeFieldValue(concept, item))
      .filter((item): item is string => item !== null);
    return parts.length > 0 ? parts.join(", ") : null;
  }

  if (DATE_CONCEPTS.has(concept)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      const iso = epochToIsoDate(value);
      if (iso) return iso;
    }
    if (typeof value === "string") {
      const text = value.trim();
      if (/^\d{10}(\d{3})?$/.test(text)) {
        const iso = epochToIsoDate(Number(text));
        if (iso) return iso;
      }
      // ISO datetime → keep just the date part.
      const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})[T ]/);
      if (isoMatch) return isoMatch[1];
    }
  }

  if (typeof value === "object") {
    try {
      const text = JSON.stringify(value);
      return text && text !== "{}" ? text : null;
    } catch {
      return null;
    }
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/** Allowlisted fields as resolved from ONE linked contact. */
export interface LinkResolution {
  ghlContactId: string;
  ghlLocationId: string;
  /** Normalized values (null = unset/unresolvable on this contact). */
  values: Record<AllowlistedFieldConcept, string | null>;
  via: Record<AllowlistedFieldConcept, ResolutionSource>;
}

export interface MergedFieldSource {
  ghlContactId: string;
  ghlLocationId: string;
  via: ResolutionSource;
}

export interface MergedFields {
  fields: Record<AllowlistedFieldConcept, string | null>;
  /** Where each resolved concept came from (null when still unset). */
  sources: Record<AllowlistedFieldConcept, MergedFieldSource | null>;
  /**
   * The link that resolved the most concepts — the student's "real" program
   * record. Escalation tasks should be created on this contact. Null only
   * when no resolutions were provided.
   */
  primary: LinkResolution | null;
}

export function emptyConceptRecord<T>(fill: T): Record<AllowlistedFieldConcept, T> {
  return Object.fromEntries(
    ALLOWLISTED_FIELD_CONCEPTS.map((concept) => [concept, fill])
  ) as Record<AllowlistedFieldConcept, T>;
}

function resolvedCount(resolution: LinkResolution): number {
  return ALLOWLISTED_FIELD_CONCEPTS.filter(
    (concept) => resolution.values[concept] !== null
  ).length;
}

/**
 * Merge per-link resolutions into one answer set.
 *
 * Primary selection: a link in a PREFERRED location (the Course sub-account,
 * the program's system of record) always wins, first in array order. Only
 * when no preferred-location link exists does the link with the most
 * resolved concepts win (first wins ties, so ordering must be
 * deterministic). Concepts the primary lacks are filled from the other
 * links in order.
 */
export function mergeLinkResolutions(
  resolutions: LinkResolution[],
  options?: { preferredLocationIds?: ReadonlySet<string> }
): MergedFields {
  const fields = emptyConceptRecord<string | null>(null);
  const sources = emptyConceptRecord<MergedFieldSource | null>(null);

  if (resolutions.length === 0) {
    return { fields, sources, primary: null };
  }

  const preferred = options?.preferredLocationIds;
  let primary =
    (preferred &&
      resolutions.find((r) => preferred.has(r.ghlLocationId))) ||
    null;
  if (!primary) {
    primary = resolutions[0];
    for (const candidate of resolutions.slice(1)) {
      if (resolvedCount(candidate) > resolvedCount(primary)) {
        primary = candidate;
      }
    }
  }

  const ordered = [primary, ...resolutions.filter((r) => r !== primary)];
  for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
    for (const resolution of ordered) {
      const value = resolution.values[concept];
      if (value !== null) {
        fields[concept] = value;
        sources[concept] = {
          ghlContactId: resolution.ghlContactId,
          ghlLocationId: resolution.ghlLocationId,
          via: resolution.via[concept],
        };
        break;
      }
    }
  }

  return { fields, sources, primary };
}
