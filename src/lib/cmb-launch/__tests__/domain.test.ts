import { describe, expect, it } from "vitest";
import { desiredAccountState, normalizeEmail, parseDateOnly, parseProduct, parseYesNo } from "../domain";

describe("CMB launch domain rules", () => {
  it("normalizes email for case-insensitive matching", () => {
    expect(normalizeEmail("  Student@Example.COM ")).toBe("student@example.com");
  });
  it("parses verified yes/no variants safely", () => {
    expect(parseYesNo(" YES ")).toEqual({ ok: true, value: "yes" });
    expect(parseYesNo("0").ok).toBe(false);
  });
  it("accepts official product names and rejects Improve Canto", () => {
    expect(parseProduct("cmbp")).toEqual({ ok: true, value: "CMBP" });
    expect(parseProduct("Improve Kanto")).toEqual({ ok: true, value: "Improve Kanto" });
    expect(parseProduct("Improve Canto").ok).toBe(false);
  });
  it("validates date-only calendar values", () => {
    expect(parseDateOnly("2026-08-31")).toEqual({ ok: true, value: "2026-08-31" });
    expect(parseDateOnly("2026-02-30").ok).toBe(false);
  });
  it("does not expire accounts before the boundary rule is approved", () => {
    expect(desiredAccountState({ courseEligibility: "yes", endDate: "2026-08-01", asOfDate: "2026-08-20", expirationRuleApproved: false }))
      .toEqual({ status: null, reviewRequired: true, reason: "expiration_boundary_unapproved" });
  });
  it("pauses an explicitly ineligible account without deleting entitlements", () => {
    expect(desiredAccountState({ courseEligibility: "no", endDate: null, asOfDate: "2026-08-20", expirationRuleApproved: false }).status)
      .toBe("paused");
  });
});
