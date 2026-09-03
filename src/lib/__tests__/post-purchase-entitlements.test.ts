import { describe, expect, it } from "vitest";
import {
  aggregatePostPurchaseStudents,
  applyPostPurchaseTagOverrides,
  canReassignAuthoritativeGhlContact,
  derivePostPurchaseTags,
  planPostPurchaseTagReconciliation,
  shouldReconcilePostPurchaseStudent,
  shouldApplyInboundPostPurchaseTagChange,
} from "@/lib/post-purchase-entitlements";

describe("applyPostPurchaseTagOverrides", () => {
  it("lets staff force a managed tag on even when GHL does not grant it", () => {
    expect(
      applyPostPurchaseTagOverrides({
        expectedTags: ["cmb_student"],
        overrides: [{ tagName: "ICGC_STUDENT", isAssigned: true }],
      })
    ).toEqual(["cmb_student", "icgc_student"]);
  });

  it("lets staff force a managed tag off even when GHL grants it", () => {
    expect(
      applyPostPurchaseTagOverrides({
        expectedTags: ["cmb_student", "1on1_student", "icgc_student"],
        overrides: [
          { tagName: "1on1_student", isAssigned: false },
          { tagName: "icgc_student", isAssigned: false },
        ],
      })
    ).toEqual(["cmb_student"]);
  });

  it("ignores overrides for tags outside post-purchase automation", () => {
    expect(
      applyPostPurchaseTagOverrides({
        expectedTags: ["cmb_student"],
        overrides: [{ tagName: "manual_vip", isAssigned: false }],
      })
    ).toEqual(["cmb_student"]);
  });
});

describe("aggregatePostPurchaseStudents", () => {
  it("unions duplicate-email purchases before entitlement reconciliation", () => {
    expect(
      aggregatePostPurchaseStudents([
        {
          email: " Student@Example.com ",
          firstName: "Student",
          productLine: "CMBP",
          addOnPurchased: "1:1 coaching",
        },
        {
          email: "student@example.com",
          lastName: "Example",
          productLine: "Improve Canto, CMBP",
          addOnPurchased: "ICGC",
        },
      ])
    ).toEqual([
      {
        email: "student@example.com",
        firstName: "Student",
        lastName: "Example",
        productLine: ["CMBP", "Improve Canto"],
        addOnPurchased: ["1:1 coaching", "ICGC"],
        oneOnOneEligibilityActive: false,
        sourceRows: 2,
      },
    ]);
  });

  it("unions active legacy 1:1 eligibility across duplicate source rows", () => {
    expect(
      aggregatePostPurchaseStudents([
        {
          email: "student@example.com",
          productLine: "Improve Canto",
          oneOnOneEligibilityActive: false,
        },
        {
          email: "student@example.com",
          productLine: "Improve Canto",
          oneOnOneEligibilityActive: true,
        },
      ])
    ).toMatchObject([{ oneOnOneEligibilityActive: true }]);
  });
});

describe("derivePostPurchaseTags", () => {
  it("unions both package selections instead of choosing the first branch", () => {
    expect(
      derivePostPurchaseTags({
        productLine: "CMBP, Improve Canto",
        addOnPurchased:
          "1:1 coaching + Discord Private Channel, ICGC (Group Coaching)",
      })
    ).toEqual(["cmb_student", "ic_student", "1on1_student", "icgc_student"]);
  });

  it("records custom-course purchases without misusing the Confident Cantonese tag", () => {
    expect(
      derivePostPurchaseTags({
        productLine: ["Improve Canto"],
        addOnPurchased: ["Custom course"],
      })
    ).toEqual(["ic_student", "custom_course_student"]);
  });

  const addOnOptions = [
    ["1:1 coaching + Discord Private Channel", "1on1_student"],
    ["ICGC (Group Coaching)", "icgc_student"],
    ["Custom course", "custom_course_student"],
  ] as const;

  for (const [productLine, baseTags] of [
    ["CMBP", ["cmb_student"]],
    ["Improve Canto", ["ic_student"]],
    ["CMBP, Improve Canto", ["cmb_student", "ic_student"]],
  ] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const selected = addOnOptions.filter((_, index) => mask & (1 << index));
      for (const format of ["array", "comma-separated"] as const) {
        it(`unions ${productLine} with add-on combination ${mask} (${format})`, () => {
          const values = selected.map(([label]) => label);
          expect(
            derivePostPurchaseTags({
              productLine,
              addOnPurchased: format === "array" ? values : values.join(", "),
            })
          ).toEqual([...baseTags, ...selected.map(([, tag]) => tag)]);
        });
      }
    }
  }

  it("does not carry one student's add-ons to the next student", () => {
    expect(
      derivePostPurchaseTags({
        productLine: "CMBP",
        addOnPurchased: addOnOptions.map(([label]) => label),
      })
    ).toEqual([
      "cmb_student",
      "1on1_student",
      "icgc_student",
      "custom_course_student",
    ]);
    expect(derivePostPurchaseTags({ productLine: "CMBP" })).toEqual([
      "cmb_student",
    ]);
  });

  it("normalizes case and duplicate custom-course selections", () => {
    expect(
      derivePostPurchaseTags({
        productLine: " CMBP ",
        addOnPurchased: [" CUSTOM COURSE ", "Custom course"],
      })
    ).toEqual(["cmb_student", "custom_course_student"]);
  });

  it("keeps 1:1 access pending while the GHL coach field is unresolved", () => {
    expect(
      derivePostPurchaseTags({
        productLine: "CMBP",
        addOnPurchased: "1:1 coaching + Discord Private Channel, ICGC",
        oneOnOneCoachAssigned: false,
      })
    ).toEqual(["cmb_student", "icgc_student"]);

    expect(
      derivePostPurchaseTags({
        productLine: "CMBP",
        addOnPurchased: "1:1 coaching + Discord Private Channel",
        oneOnOneCoachAssigned: true,
      })
    ).toEqual(["cmb_student", "1on1_student"]);
  });

  it("honors active legacy 1:1 eligibility without reviving expired access", () => {
    expect(
      derivePostPurchaseTags({
        productLine: "Improve Canto",
        oneOnOneEligibilityActive: true,
        oneOnOneCoachAssigned: true,
      })
    ).toEqual(["ic_student", "1on1_student"]);

    expect(
      derivePostPurchaseTags({
        productLine: "Improve Canto",
        oneOnOneEligibilityActive: false,
        oneOnOneCoachAssigned: true,
      })
    ).toEqual(["ic_student"]);

    expect(
      derivePostPurchaseTags({
        productLine: "Improve Canto",
        oneOnOneEligibilityActive: true,
        oneOnOneCoachAssigned: false,
      })
    ).toEqual(["ic_student"]);
  });
});

describe("shouldApplyInboundPostPurchaseTagChange", () => {
  it("treats GHL as an additive entitlement source", () => {
    const expected = ["cmb_student", "icgc_student"] as const;

    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "icgc_student",
        action: "remove",
        expectedTags: expected,
      })
    ).toBe(false);
    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "1on1_student",
        action: "add",
        expectedTags: expected,
      })
    ).toBe(true);
    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "manual_vip",
        action: "remove",
        expectedTags: expected,
      })
    ).toBe(false);
  });
});

describe("planPostPurchaseTagReconciliation", () => {
  it("adds the missing custom-course marker without changing other selected add-ons", () => {
    expect(
      planPostPurchaseTagReconciliation({
        currentTags: [
          "cmb_student",
          "1on1_student",
          "icgc_student",
          "cc_student",
          "manual_vip",
        ],
        expectedTags: [
          "cmb_student",
          "1on1_student",
          "icgc_student",
          "custom_course_student",
        ],
      })
    ).toEqual({ add: ["custom_course_student"], remove: [] });
  });

  it("adds missing entitlements without revoking existing access", () => {
    expect(
      planPostPurchaseTagReconciliation({
        currentTags: ["cmb_student", "1on1_student", "manual_vip"],
        expectedTags: ["cmb_student", "icgc_student"],
      })
    ).toEqual({ add: ["icgc_student"], remove: [] });
  });
});

describe("shouldReconcilePostPurchaseStudent", () => {
  const correct = {
    userExists: true,
    currentTags: ["cmb_student"],
    expectedTags: ["cmb_student"] as const,
    hasCourseContact: true,
    resyncGhl: false,
  };

  it("skips only when the account, tags, and course-subaccount link are all healthy", () => {
    expect(shouldReconcilePostPurchaseStudent(correct)).toBe(false);
  });

  it("repairs a missing course-subaccount contact even when local tags are correct", () => {
    expect(
      shouldReconcilePostPurchaseStudent({
        ...correct,
        hasCourseContact: false,
      })
    ).toBe(true);
  });

  it("reconciles missing users, tag drift, and explicit GHL resyncs", () => {
    expect(
      shouldReconcilePostPurchaseStudent({ ...correct, userExists: false })
    ).toBe(true);
    expect(
      shouldReconcilePostPurchaseStudent({
        ...correct,
        currentTags: [],
      })
    ).toBe(true);
    expect(
      shouldReconcilePostPurchaseStudent({ ...correct, resyncGhl: true })
    ).toBe(true);
  });
});

describe("canReassignAuthoritativeGhlContact", () => {
  it("allows reassignment only for an email upsert in the same location", () => {
    expect(
      canReassignAuthoritativeGhlContact({
        authoritativeEmailUpsert: true,
        existingLocationId: "course-location",
        requestedLocationId: "course-location",
      })
    ).toBe(true);
    expect(
      canReassignAuthoritativeGhlContact({
        authoritativeEmailUpsert: false,
        existingLocationId: "course-location",
        requestedLocationId: "course-location",
      })
    ).toBe(false);
    expect(
      canReassignAuthoritativeGhlContact({
        authoritativeEmailUpsert: true,
        existingLocationId: "sales-location",
        requestedLocationId: "course-location",
      })
    ).toBe(false);
  });
});
