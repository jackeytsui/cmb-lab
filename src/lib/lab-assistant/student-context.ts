// src/lib/lab-assistant/student-context.ts
// Data gatekeeper for the CMB Lab Assistant.
//
// The AI never calls GHL directly. This middleware:
//   session user (server-resolved) → single-record GHL lookup (cached)
//   → allowlisted fields ONLY → injected into model context.
//
// Identity is always the signed-in session user — identity claims typed in
// chat are never trusted. One student's data per request; no other contact
// is ever loaded, so cross-student leakage is structurally impossible.
// Every field fetch is audit-logged (field names + presence only, no values).

import type { User } from "@/db/schema";
import { fetchGhlContactData } from "@/lib/ghl/contact-fields";
import { findOrLinkContact, getGhlContactId } from "@/lib/ghl/contacts";
import { resolveAllowlistedFields } from "./field-resolution";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import {
  ALLOWLISTED_FIELD_CONCEPTS,
  type AllowlistedFieldConcept,
} from "./allowlist";

export interface StudentContext {
  /** First name for greeting (GHL contact first, LMS profile fallback). */
  firstName: string | null;
  /** Session email — the unique identifier shown in the widget header. */
  email: string;
  /** Allowlisted GHL fields; null when empty or unmapped (default DENY for all others). */
  fields: Record<AllowlistedFieldConcept, string | null>;
  /** Linked GHL contact for task creation; null when the student isn't linked. */
  ghlContactId: string | null;
}

function emptyFields(): Record<AllowlistedFieldConcept, string | null> {
  return Object.fromEntries(
    ALLOWLISTED_FIELD_CONCEPTS.map((concept) => [concept, null])
  ) as Record<AllowlistedFieldConcept, string | null>;
}

function toDisplayValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Resolve the signed-in student's assistant context from their GHL contact.
 * Single-record lookup, allowlisted fields only, audit-logged.
 * Degrades gracefully: on any GHL failure the assistant still works with
 * empty fields (friendly null phrasing + escalation path).
 */
export async function getStudentContext(user: User): Promise<StudentContext> {
  const fields = emptyFields();
  const firstNameFallback = user.name?.trim().split(/\s+/)[0] ?? null;

  // Ensure the user is linked to their GHL contact (by session email, server-side).
  let ghlContactId: string | null = null;
  try {
    ghlContactId = await getGhlContactId(user.id);
    if (!ghlContactId) {
      const links = await findOrLinkContact(user.id, user.email);
      ghlContactId = links[0]?.ghlContactId ?? null;
    }
  } catch (error) {
    console.error(
      "[Lab Assistant] Could not link GHL contact:",
      error instanceof Error ? error.message : error
    );
  }

  if (!ghlContactId) {
    return {
      firstName: firstNameFallback,
      email: user.email,
      fields,
      ghlContactId: null,
    };
  }

  let firstName = firstNameFallback;
  let resolvedVia: Record<string, string | null> = {};
  try {
    const { data } = await fetchGhlContactData(user.id);
    if (data) {
      firstName = data.firstName?.trim() || firstNameFallback;

      // Self-healing resolution: explicit mapping by ID, then by field name,
      // then built-in name heuristics — strictly allowlist-scoped.
      const resolution = await resolveAllowlistedFields(
        ghlContactId,
        data.customFields
      );
      resolvedVia = resolution.via;
      for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
        fields[concept] = toDisplayValue(resolution.values[concept]);
      }
    }
  } catch (error) {
    console.error(
      "[Lab Assistant] Field fetch failed:",
      error instanceof Error ? error.message : error
    );
  }

  // Audit trail: which fields were fetched, whether they had values, and how
  // each resolved (mapping / mapping-name / auto). Values are intentionally
  // omitted (PII stays out of analytics).
  await logSyncEvent({
    eventType: "lab_assistant.field_fetch",
    direction: "outbound",
    entityType: "lab_assistant",
    entityId: user.id,
    ghlContactId,
    payload: {
      allowlist: [...ALLOWLISTED_FIELD_CONCEPTS],
      present: Object.fromEntries(
        ALLOWLISTED_FIELD_CONCEPTS.map((concept) => [
          concept,
          fields[concept] !== null,
        ])
      ),
      resolvedVia,
    },
  }).catch((error) => {
    console.error("[Lab Assistant] Failed to write field-fetch audit log:", error);
  });

  return { firstName, email: user.email, fields, ghlContactId };
}
