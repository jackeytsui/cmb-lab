// src/lib/lab-assistant/student-context.ts
// Data gatekeeper for the CMB Lab Assistant.
//
// The AI never calls GHL directly. This middleware:
//   session user (server-resolved) → the user's OWN linked GHL contacts
//   (one per sub-account, each read against its own location)
//   → EMAIL-VERIFIED links only → allowlisted fields ONLY, merged across
//   links → injected into model context.
//
// The student unit identifier is the EMAIL ADDRESS, never a contact ID:
// identity is always the signed-in session user (identity claims typed in
// chat are never trusted), and a linked contact is only used when the
// contact's email in GHL matches the session email — a stale or mislinked
// contact ID can never answer for a student. Only contacts linked to that
// one user are ever loaded, so cross-student leakage is structurally
// impossible. Every field fetch is audit-logged (field names + presence
// only, no values).
//
// Sub-account preference: students exist in two GHL sub-accounts — the
// marketing location ("The Canto to Mando Blueprint") and the program
// location ("The Canto to Mando Blueprint Course"). The Course location is
// the system of record: its contact is always the primary record (greeting,
// escalation tasks), and only gaps are filled from the other links.

import type { User } from "@/db/schema";
import { fetchGhlContactDataForLink } from "@/lib/ghl/contact-fields";
import {
  findOrLinkContact,
  getActiveGhlLocations,
  getGhlContactLinks,
} from "@/lib/ghl/contacts";
import { resolveAllowlistedFields } from "./field-resolution";
import {
  emptyConceptRecord,
  mergeLinkResolutions,
  normalizeFieldValue,
  PREFERRED_LOCATION_NAME_PATTERN,
  type LinkResolution,
} from "./field-merge";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import {
  ALLOWLISTED_FIELD_CONCEPTS,
  type AllowlistedFieldConcept,
} from "./allowlist";

/** Safety cap on how many linked sub-accounts are read per request. */
const MAX_LINKS = 5;

export interface StudentContext {
  /** First name for greeting (GHL contact first, LMS profile fallback). */
  firstName: string | null;
  /** Session email — the student unit identifier shown in the widget header. */
  email: string;
  /** Allowlisted GHL fields; null when empty or unmapped (default DENY for all others). */
  fields: Record<AllowlistedFieldConcept, string | null>;
  /**
   * Contact for task creation — the primary link (Course location when
   * present, email-verified); null when the student isn't linked.
   */
  ghlContactId: string | null;
}

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/**
 * Resolve the signed-in student's assistant context from their linked GHL
 * contacts. Email-verified links only, allowlisted fields only,
 * audit-logged, merged across links with the Course sub-account as the
 * system of record.
 * Degrades gracefully: on any GHL failure the assistant still works with
 * empty fields (friendly null phrasing + escalation path).
 */
export async function getStudentContext(user: User): Promise<StudentContext> {
  const firstNameFallback = user.name?.trim().split(/\s+/)[0] ?? null;
  const sessionEmail = normalizeEmail(user.email);

  // Ensure the user is linked to their GHL contact(s). Linking is BY EMAIL
  // (session email, server-side); getGhlContactLinks returns active links
  // oldest-first.
  let links: Array<{ ghlContactId: string; ghlLocationId: string }> = [];
  try {
    links = await getGhlContactLinks(user.id);
    if (links.length === 0) {
      links = (await findOrLinkContact(user.id, user.email)).map((link) => ({
        ghlContactId: link.ghlContactId,
        ghlLocationId: link.ghlLocationId,
      }));
    }
  } catch (error) {
    console.error(
      "[Lab Assistant] Could not link GHL contact:",
      error instanceof Error ? error.message : error
    );
  }

  if (links.length === 0) {
    return {
      firstName: firstNameFallback,
      email: user.email,
      fields: emptyConceptRecord<string | null>(null),
      ghlContactId: null,
    };
  }

  // The Course sub-account is the system of record — read it first and let
  // it win as primary. (Empty set when locations aren't in the table; the
  // merge then falls back to most-resolved.)
  const locations = await getActiveGhlLocations();
  const preferredLocationIds: ReadonlySet<string> = new Set(
    locations
      .filter((location) =>
        PREFERRED_LOCATION_NAME_PATTERN.test(location.name ?? "")
      )
      .map((location) => location.ghlLocationId)
  );
  links = [
    ...links.filter((link) => preferredLocationIds.has(link.ghlLocationId)),
    ...links.filter((link) => !preferredLocationIds.has(link.ghlLocationId)),
  ];

  // Read each linked contact against its OWN location, verify the contact's
  // email against the session email (the unit identifier — a contact ID
  // whose email doesn't match never answers), then resolve the allowlisted
  // concepts there. Per-link failures degrade to that link resolving
  // nothing — the others still count.
  const resolutions: LinkResolution[] = [];
  const skippedLinks: Array<{ ghlContactId: string; reason: string }> = [];
  const firstNameByContact = new Map<string, string | null>();
  for (const link of links.slice(0, MAX_LINKS)) {
    try {
      const { data } = await fetchGhlContactDataForLink(link);
      if (!data) continue;

      const contactEmail = normalizeEmail(data.email);
      if (contactEmail !== sessionEmail) {
        skippedLinks.push({
          ghlContactId: link.ghlContactId,
          reason: contactEmail ? "email_mismatch" : "email_missing",
        });
        continue;
      }

      firstNameByContact.set(link.ghlContactId, data.firstName?.trim() || null);

      const resolution = await resolveAllowlistedFields(
        link.ghlLocationId,
        data.customFields
      );
      const values = emptyConceptRecord<string | null>(null);
      for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
        values[concept] = normalizeFieldValue(
          concept,
          resolution.values[concept]
        );
      }
      resolutions.push({ ...link, values, via: resolution.via });
    } catch (error) {
      console.error(
        `[Lab Assistant] Field fetch failed for contact ${link.ghlContactId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  const merged = mergeLinkResolutions(resolutions, { preferredLocationIds });
  // Tasks only ever go to an email-verified contact; a student with no
  // verified link gets null (escalations still work, unattached).
  const ghlContactId = merged.primary?.ghlContactId ?? null;
  const firstName =
    (ghlContactId ? firstNameByContact.get(ghlContactId) : null) ??
    [...firstNameByContact.values()].find(Boolean) ??
    firstNameFallback;

  // Audit trail: which fields were fetched, whether they had values, how
  // each resolved (mapping / mapping-name / auto + which link it came from),
  // and any links skipped by email verification. Values are intentionally
  // omitted (PII stays out of analytics).
  await logSyncEvent({
    eventType: "lab_assistant.field_fetch",
    direction: "outbound",
    entityType: "lab_assistant",
    entityId: user.id,
    ghlContactId: ghlContactId ?? undefined,
    payload: {
      allowlist: [...ALLOWLISTED_FIELD_CONCEPTS],
      linksRead: resolutions.length,
      skippedLinks,
      present: Object.fromEntries(
        ALLOWLISTED_FIELD_CONCEPTS.map((concept) => [
          concept,
          merged.fields[concept] !== null,
        ])
      ),
      resolvedVia: Object.fromEntries(
        ALLOWLISTED_FIELD_CONCEPTS.map((concept) => [
          concept,
          merged.sources[concept]
            ? {
                via: merged.sources[concept].via,
                locationId: merged.sources[concept].ghlLocationId,
              }
            : null,
        ])
      ),
    },
  }).catch((error) => {
    console.error("[Lab Assistant] Failed to write field-fetch audit log:", error);
  });

  return {
    firstName: firstName ?? firstNameFallback,
    email: user.email,
    fields: merged.fields,
    ghlContactId,
  };
}
