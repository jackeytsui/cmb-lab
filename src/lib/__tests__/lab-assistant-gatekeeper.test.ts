// Gatekeeper tests for the Lab Assistant: the model context must contain
// ONLY the five allowlisted concepts in human language — never payments,
// notes, addresses, tags, or any other GHL data, and never raw formats
// (epoch dates, field IDs).
//
// The fixture mirrors the real GHL contact export schema (same custom-field
// column names as the Course sub-account) with fictional student data.

import { describe, it, expect } from "vitest";
import {
  suggestField,
  normalizeFieldValue,
  mergeLinkResolutions,
  emptyConceptRecord,
  type LinkResolution,
  type CatalogField,
} from "@/lib/lab-assistant/field-merge";
import { ALLOWLISTED_FIELD_CONCEPTS } from "@/lib/lab-assistant/allowlist";
import { renderStudentContext } from "@/lib/lab-assistant/guidance";

// Real field NAMES from the GHL export (fictional values). Sensitive
// business fields are here on purpose: the pipeline must never surface them.
const COURSE_CONTACT_FIELDS: Array<CatalogField & { value: unknown }> = [
  { id: "fld_coach", name: "Coach name", value: "Jane Ip" },
  { id: "fld_start", name: "Product Start Date", value: 1778544000000 },
  { id: "fld_end", name: "Product END date", value: "2026-11-12T00:00:00.000Z" },
  { id: "fld_ref_status", name: "Referral Status", value: "1 reward pending" },
  { id: "fld_ref_src", name: "Referred By", value: "A friend" },
  // Sensitive — must stay unreadable:
  { id: "fld_paid", name: "Paid total", value: "4999" },
  { id: "fld_paystatus", name: "Payment Status", value: "Paid in full" },
  { id: "fld_notes", name: "General notes", value: "Negotiated discount, VIP" },
  { id: "fld_addr", name: "Street Address", value: "123 Secret Lane" },
  { id: "fld_goal", name: "Why they wanna learn Chinese - what's their main goal?", value: "Family" },
  { id: "fld_plan", name: "Access plan", value: "Lifetime beta" },
];

const SENSITIVE_VALUES = [
  "4999",
  "Paid in full",
  "Negotiated discount",
  "VIP",
  "123 Secret Lane",
  "Lifetime beta",
];

/**
 * Simulate the production auto-resolution path (field-resolution.ts step 3)
 * offline: name heuristics over the location catalog, values normalized.
 */
function resolveOffline(
  ghlContactId: string,
  ghlLocationId: string,
  contactFields: Array<CatalogField & { value: unknown }>
): LinkResolution {
  const catalog: CatalogField[] = contactFields.map(({ id, name }) => ({
    id,
    name,
  }));
  const values = emptyConceptRecord<string | null>(null);
  const via = emptyConceptRecord<"mapping" | "mapping-name" | "auto" | null>(
    null
  );
  for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
    const match = suggestField(concept, catalog);
    if (match) {
      const raw = contactFields.find((f) => f.id === match.id)?.value;
      values[concept] = normalizeFieldValue(concept, raw);
      via[concept] = "auto";
    }
  }
  return { ghlContactId, ghlLocationId, values, via };
}

describe("Lab Assistant gatekeeper (offline pipeline simulation)", () => {
  const resolution = resolveOffline(
    "c-course",
    "loc-course",
    COURSE_CONTACT_FIELDS
  );
  const merged = mergeLinkResolutions([resolution], {
    preferredLocationIds: new Set(["loc-course"]),
  });
  const context = renderStudentContext({
    firstName: "Mei",
    email: "mei.wong@example.com",
    fields: merged.fields,
    coach: { status: "assigned", name: "Jane Ip", source: "ghl" },
    coachingAccess: { innerCircle: true, oneOnOne: true },
    ghlContactId: "c-course",
  });

  it("resolves all five allowlisted concepts in human language", () => {
    expect(merged.fields.assigned_coach).toBe("Jane Ip");
    expect(merged.fields.start_date).toBe("2026-05-12");
    expect(merged.fields.end_date).toBe("2026-11-12");
    expect(merged.fields.referral_status).toBe("1 reward pending");
    expect(merged.fields.referral_source).toBe("A friend");
  });

  it("delivers dates as human language in the model context", () => {
    expect(context).toContain("May 12, 2026");
    expect(context).toContain("November 12, 2026");
    // Raw formats never reach the model.
    expect(context).not.toContain("1778544000000");
    expect(context).not.toContain("T00:00:00");
  });

  it("identifies the student by email, never by internal IDs", () => {
    expect(context).toContain("mei.wong@example.com");
    expect(context).not.toContain("c-course");
    expect(context).not.toContain("loc-course");
    expect(context).not.toContain("fld_");
    expect(context).not.toContain("icgc_student");
    expect(context).not.toContain("1on1_student");
  });

  it("gives the model human-readable coaching access without internal tags", () => {
    expect(context).toContain("1:1 Coaching access: included");
    expect(context).toContain(
      "Inner Circle Group Coaching access: included",
    );
  });

  it("never exposes sensitive business fields (default DENY)", () => {
    // Structural: only the five concepts exist in the resolved field set.
    expect(Object.keys(merged.fields).sort()).toEqual(
      [...ALLOWLISTED_FIELD_CONCEPTS].sort()
    );
    for (const sensitive of SENSITIVE_VALUES) {
      expect(context).not.toContain(sensitive);
    }
    expect(context).not.toMatch(/paid|payment|notes|address|plan/i);
  });

  it("keeps friendly phrasing for missing data (no nulls or field jargon)", () => {
    const emptyContext = renderStudentContext({
      firstName: null,
      email: "new.student@example.com",
      fields: emptyConceptRecord<string | null>(null),
      coach: { status: "unassigned", name: null, source: "cmb_lab" },
      coachingAccess: { innerCircle: false, oneOnOne: false },
      ghlContactId: null,
    });
    expect(emptyContext).toContain("not set");
    expect(emptyContext).not.toContain("null");
    expect(emptyContext).not.toContain("undefined");
  });

  it("does not describe an unavailable coach lookup as unassigned", () => {
    const unavailableContext = renderStudentContext({
      firstName: "Ari",
      email: "ari@example.com",
      fields: emptyConceptRecord<string | null>(null),
      coach: { status: "unavailable", name: null, source: null },
      coachingAccess: { innerCircle: false, oneOnOne: false },
      ghlContactId: null,
    });
    expect(unavailableContext).toContain("temporarily unavailable");
    expect(unavailableContext).toContain("Do not guess");
    expect(unavailableContext).not.toContain("No coach has been assigned");
  });
});
