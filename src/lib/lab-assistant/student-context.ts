// src/lib/lab-assistant/student-context.ts
// Data gatekeeper for the CMB Lab Assistant.
//
// The AI never calls GHL directly. This middleware:
//   session user (server-resolved) → the user's OWN linked GHL contacts
//   (one per sub-account, each read against its own location)
//   → allowlisted fields ONLY, merged across links → injected into context.
//
// Identity is always the signed-in session user — identity claims typed in
// chat are never trusted. Only contacts linked to that one user are ever
// loaded, so cross-student leakage is structurally impossible.
// Every field fetch is audit-logged (field names + presence only, no values).
//
// Why merge across links: students can exist in more than one GHL
// sub-account (e.g. marketing + program locations). Their start date or
// coach may live on only one of those contacts. Reading a single arbitrary
// link made the bot answer "not set" for data that exists — so each active
// link is resolved against its own location's field catalog, the link that
// resolves the most concepts becomes the primary record (escalation tasks go
// there), and gaps are filled from the remaining links deterministically.

import type { User } from "@/db/schema";
import { fetchGhlContactDataForLink } from "@/lib/ghl/contact-fields";
import { findOrLinkContact, getGhlContactLinks } from "@/lib/ghl/contacts";
import { resolveAllowlistedFields } from "./field-resolution";
import {
  emptyConceptRecord,
  mergeLinkResolutions,
  normalizeFieldValue,
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
  /** Session email — the unique identifier shown in the widget header. */
  email: string;
  /** Allowlisted GHL fields; null when empty or unmapped (default DENY for all others). */
  fields: Record<AllowlistedFieldConcept, string | null>;
  /**
   * Contact for task creation — the primary link (the one the student's
   * program data resolved from); null when the student isn't linked.
   */
  ghlContactId: string | null;
}

/**
 * Resolve the signed-in student's assistant context from their linked GHL
 * contacts. Allowlisted fields only, audit-logged, merged across links so
 * the answer comes from whichever sub-account actually holds the data.
 * Degrades gracefully: on any GHL failure the assistant still works with
 * empty fields (friendly null phrasing + escalation path).
 */
export async function getStudentContext(user: User): Promise<StudentContext> {
  const firstNameFallback = user.name?.trim().split(/\s+/)[0] ?? null;

  // Ensure the user is linked to their GHL contact(s) (by session email,
  // server-side). getGhlContactLinks returns active links oldest-first.
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

  // Read each linked contact against its OWN location and resolve the
  // allowlisted concepts there. Per-link failures degrade to that link
  // resolving nothing — the others still count.
  const resolutions: LinkResolution[] = [];
  const firstNameByContact = new Map<string, string | null>();
  for (const link of links.slice(0, MAX_LINKS)) {
    try {
      const { data } = await fetchGhlContactDataForLink(link);
      if (!data) continue;
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

  const merged = mergeLinkResolutions(resolutions);
  const ghlContactId = merged.primary?.ghlContactId ?? links[0].ghlContactId;
  const firstName =
    firstNameByContact.get(ghlContactId) ??
    [...firstNameByContact.values()].find(Boolean) ??
    firstNameFallback;

  // Audit trail: which fields were fetched, whether they had values, and how
  // each resolved (mapping / mapping-name / auto + which link it came from).
  // Values are intentionally omitted (PII stays out of analytics).
  await logSyncEvent({
    eventType: "lab_assistant.field_fetch",
    direction: "outbound",
    entityType: "lab_assistant",
    entityId: user.id,
    ghlContactId,
    payload: {
      allowlist: [...ALLOWLISTED_FIELD_CONCEPTS],
      linksRead: resolutions.length,
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
