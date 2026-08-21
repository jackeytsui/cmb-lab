import { describe, expect, it } from "vitest";
import { reconcileStudents, type SourceStudent } from "../reconcile";

const source = (overrides: Partial<SourceStudent> = {}): SourceStudent => ({
  rowNumber: 2, ghlContactId: "ghl_anon_1", email: " Student@Example.com ",
  product: "CMBP", courseEligibility: "YES", oneOnOneEligibility: "NO",
  productStartDate: "2026-01-01", productEndDate: "", ...overrides,
});

describe("CMB launch reconciliation", () => {
  it("matches an existing user by normalized email and preserves custom courses", () => {
    const result = reconcileStudents({ students: [source()], asOfDate: "2026-08-20", existingUsers: [{
      id: "user_anon_1", email: "student@example.com", accountStatus: "active", product: "CMBP",
      courseIds: ["course_standard"], customCourseIds: ["course_custom"],
    }] });
    expect(result.rows[0]).toMatchObject({ classification: "existing_correct", cmbLabUserId: "user_anon_1", customCourseIdsPreserved: ["course_custom"] });
    expect(result.rows[0].proposedCourseChanges).toEqual([]);
  });
  it("classifies a new eligible user without creating anything", () => {
    expect(reconcileStudents({ students: [source()], existingUsers: [], asOfDate: "2026-08-20" }).rows[0].classification).toBe("new_ready");
  });
  it("flags duplicate normalized emails", () => {
    const result = reconcileStudents({ students: [source(), source({ rowNumber: 3, email: "student@example.com" })], existingUsers: [], asOfDate: "2026-08-20" });
    expect(result.counts.duplicate_email_review).toBe(2);
  });
  it("flags unknown products and never silently maps Improve Canto", () => {
    expect(reconcileStudents({ students: [source({ product: "Improve Canto" })], existingUsers: [], asOfDate: "2026-08-20" }).rows[0].classification).toBe("unknown_product");
  });
  it("classifies safe reactivation while retaining assignments", () => {
    const result = reconcileStudents({ students: [source()], asOfDate: "2026-08-20", existingUsers: [{ id: "u1", email: "student@example.com", accountStatus: "paused", product: "CMBP", courseIds: ["c1"], customCourseIds: ["custom1"] }] });
    expect(result.rows[0]).toMatchObject({ classification: "existing_reactivate", currentCourseIds: ["c1"], customCourseIdsPreserved: ["custom1"] });
  });
});
