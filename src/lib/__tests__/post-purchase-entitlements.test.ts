import { describe, expect, it } from "vitest";
import {
  derivePostPurchaseTags,
  planPostPurchaseTagReconciliation,
  shouldApplyInboundPostPurchaseTagChange,
} from "@/lib/post-purchase-entitlements";

describe("derivePostPurchaseTags", () => {
  it("unions both package selections instead of choosing the first branch", () => {
    expect(
      derivePostPurchaseTags({
        productLine: "CMBP, Improve Canto",
        addOnPurchased:
          "1:1 coaching + Discord Private Channel, ICGC (Group Coaching)",
      }),
    ).toEqual([
      "cmb_student",
      "ic_student",
      "1on1_student",
      "icgc_student",
    ]);
  });

  it("accepts array values and ignores the manual custom-course option", () => {
    expect(
      derivePostPurchaseTags({
        productLine: ["Improve Canto"],
        addOnPurchased: ["Custom course"],
      }),
    ).toEqual(["ic_student"]);
  });
});

describe("shouldApplyInboundPostPurchaseTagChange", () => {
  it("keeps configured post-purchase access authoritative across GHL locations", () => {
    const expected = ["cmb_student", "icgc_student"] as const;

    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "icgc_student",
        action: "remove",
        expectedTags: expected,
      }),
    ).toBe(false);
    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "1on1_student",
        action: "add",
        expectedTags: expected,
      }),
    ).toBe(false);
    expect(
      shouldApplyInboundPostPurchaseTagChange({
        tagName: "manual_vip",
        action: "remove",
        expectedTags: expected,
      }),
    ).toBe(true);
  });
});

describe("planPostPurchaseTagReconciliation", () => {
  it("adds missing entitlements and removes only controlled stale tags", () => {
    expect(
      planPostPurchaseTagReconciliation({
        currentTags: ["cmb_student", "1on1_student", "manual_vip"],
        expectedTags: ["cmb_student", "icgc_student"],
      }),
    ).toEqual({ add: ["icgc_student"], remove: ["1on1_student"] });
  });
});
