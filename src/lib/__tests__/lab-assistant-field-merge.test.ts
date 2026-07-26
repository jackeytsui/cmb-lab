import { describe, it, expect } from "vitest";
import {
  suggestField,
  normalizeFieldValue,
  mergeLinkResolutions,
  emptyConceptRecord,
  type LinkResolution,
} from "@/lib/lab-assistant/field-merge";
import { ALLOWLISTED_FIELD_CONCEPTS } from "@/lib/lab-assistant/allowlist";

// ============================================================
// suggestField — name heuristics
// ============================================================

describe("suggestField", () => {
  const catalog = [
    { id: "f1", name: "Program Start Date" },
    { id: "f2", name: "Product END date" },
    { id: "f3", name: "Assigned Coach" },
    { id: "f4", name: "Referral Status" },
    { id: "f5", name: "Referred By" },
  ];

  it("matches each concept to the expected field", () => {
    expect(suggestField("start_date", catalog)?.id).toBe("f1");
    expect(suggestField("end_date", catalog)?.id).toBe("f2");
    expect(suggestField("assigned_coach", catalog)?.id).toBe("f3");
    expect(suggestField("referral_status", catalog)?.id).toBe("f4");
    expect(suggestField("referral_source", catalog)?.id).toBe("f5");
  });

  it("does not match referral_source to a status field", () => {
    expect(
      suggestField("referral_source", [{ id: "x", name: "Referral Status" }])
    ).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(suggestField("start_date", [{ id: "x", name: "Phone" }])).toBeNull();
  });
});

// ============================================================
// normalizeFieldValue — raw GHL values → model-safe text
// ============================================================

describe("normalizeFieldValue", () => {
  it("passes through plain strings trimmed", () => {
    expect(normalizeFieldValue("assigned_coach", "  Jane Ip ")).toBe("Jane Ip");
  });

  it("returns null for null/undefined/empty", () => {
    expect(normalizeFieldValue("start_date", null)).toBeNull();
    expect(normalizeFieldValue("start_date", undefined)).toBeNull();
    expect(normalizeFieldValue("start_date", "   ")).toBeNull();
  });

  it("converts epoch milliseconds to an ISO date for date concepts", () => {
    // 2026-05-12T00:00:00.000Z
    expect(normalizeFieldValue("start_date", 1778544000000)).toBe("2026-05-12");
    expect(normalizeFieldValue("end_date", "1778544000000")).toBe("2026-05-12");
  });

  it("converts epoch seconds to an ISO date for date concepts", () => {
    expect(normalizeFieldValue("start_date", "1778544000")).toBe("2026-05-12");
  });

  it("trims ISO datetimes to the date part", () => {
    expect(
      normalizeFieldValue("end_date", "2026-11-12T00:00:00.000Z")
    ).toBe("2026-11-12");
    expect(normalizeFieldValue("end_date", "2026-11-12 08:30:00")).toBe(
      "2026-11-12"
    );
  });

  it("keeps plain date strings as-is", () => {
    expect(normalizeFieldValue("start_date", "2026-05-12")).toBe("2026-05-12");
  });

  it("does not treat numbers as epochs for non-date concepts", () => {
    expect(normalizeFieldValue("referral_status", "1778544000000")).toBe(
      "1778544000000"
    );
  });

  it("joins array values", () => {
    expect(
      normalizeFieldValue("referral_status", ["Pending", "Reward due"])
    ).toBe("Pending, Reward due");
    expect(normalizeFieldValue("referral_status", [])).toBeNull();
  });
});

// ============================================================
// mergeLinkResolutions — multi-location merge
// ============================================================

function resolution(
  ghlContactId: string,
  ghlLocationId: string,
  partial: Partial<Record<(typeof ALLOWLISTED_FIELD_CONCEPTS)[number], string>>
): LinkResolution {
  const values = emptyConceptRecord<string | null>(null);
  const via = emptyConceptRecord<"mapping" | "mapping-name" | "auto" | null>(
    null
  );
  for (const [concept, value] of Object.entries(partial)) {
    values[concept as keyof typeof values] = value;
    via[concept as keyof typeof via] = "auto";
  }
  return { ghlContactId, ghlLocationId, values, via };
}

describe("mergeLinkResolutions", () => {
  it("returns empty fields and null primary for no resolutions", () => {
    const merged = mergeLinkResolutions([]);
    expect(merged.primary).toBeNull();
    for (const concept of ALLOWLISTED_FIELD_CONCEPTS) {
      expect(merged.fields[concept]).toBeNull();
      expect(merged.sources[concept]).toBeNull();
    }
  });

  it("picks the link with the most resolved concepts as primary", () => {
    const marketing = resolution("c-mkt", "loc-mkt", {
      referral_source: "Instagram",
    });
    const program = resolution("c-prog", "loc-prog", {
      start_date: "2026-05-12",
      end_date: "2026-11-12",
      assigned_coach: "Jane",
    });
    const merged = mergeLinkResolutions([marketing, program]);

    expect(merged.primary?.ghlContactId).toBe("c-prog");
    expect(merged.fields.start_date).toBe("2026-05-12");
    expect(merged.fields.assigned_coach).toBe("Jane");
    // Gap filled from the secondary link
    expect(merged.fields.referral_source).toBe("Instagram");
    expect(merged.sources.referral_source?.ghlContactId).toBe("c-mkt");
    expect(merged.sources.start_date?.ghlContactId).toBe("c-prog");
  });

  it("prefers the primary link's value when both links have one", () => {
    const a = resolution("c-a", "loc-a", {
      start_date: "2026-01-01",
      assigned_coach: "Alex",
    });
    const b = resolution("c-b", "loc-b", { start_date: "2025-01-01" });
    const merged = mergeLinkResolutions([a, b]);
    expect(merged.primary?.ghlContactId).toBe("c-a");
    expect(merged.fields.start_date).toBe("2026-01-01");
  });

  it("breaks ties by array order (deterministic)", () => {
    const a = resolution("c-a", "loc-a", { start_date: "2026-01-01" });
    const b = resolution("c-b", "loc-b", { end_date: "2026-06-01" });
    const merged = mergeLinkResolutions([a, b]);
    expect(merged.primary?.ghlContactId).toBe("c-a");
    expect(merged.fields.end_date).toBe("2026-06-01");
  });
});
