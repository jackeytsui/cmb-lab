import { describe, expect, it } from "vitest";
import { shouldApplyTagChangeAgainstStaffOverride } from "@/lib/tag-override-policy";

describe("staff tag override policy", () => {
  it("allows automation when staff has not made a choice", () => {
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: undefined,
        action: "add",
      })
    ).toBe(true);
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: null,
        action: "remove",
      })
    ).toBe(true);
  });

  it("protects a staff force-on choice", () => {
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: true,
        action: "add",
      })
    ).toBe(true);
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: true,
        action: "remove",
      })
    ).toBe(false);
  });

  it("protects a staff force-off choice", () => {
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: false,
        action: "add",
      })
    ).toBe(false);
    expect(
      shouldApplyTagChangeAgainstStaffOverride({
        overrideIsAssigned: false,
        action: "remove",
      })
    ).toBe(true);
  });
});
