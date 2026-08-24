import { describe, expect, it } from "vitest";
import { FEATURE_DEFINITIONS, FEATURE_KEYS } from "@/lib/feature-definitions";
import {
  PLATFORM_ROLE_DEFINITIONS,
  PLATFORM_ROLES,
  hasFullFeatureAccess,
  hasMinimumPlatformRole,
  normalizePlatformRole,
  resolveNonDowngradingPlatformRole,
} from "@/lib/platform-roles";

describe("platform roles", () => {
  it("defines the complete database and UI role set", () => {
    expect(PLATFORM_ROLES).toEqual([
      "student",
      "consultant",
      "temp",
      "coach",
      "operations",
      "admin",
    ]);
    expect(PLATFORM_ROLE_DEFINITIONS.map(({ role }) => role)).toEqual([
      "admin",
      "operations",
      "coach",
      "consultant",
      "temp",
      "student",
    ]);
  });

  it("gives every staff role staff access while reserving admin access", () => {
    for (const role of ["consultant", "temp", "coach", "operations"] as const) {
      expect(hasMinimumPlatformRole(role, "coach")).toBe(true);
      expect(hasMinimumPlatformRole(role, "admin")).toBe(false);
    }
    expect(hasMinimumPlatformRole("admin", "admin")).toBe(true);
    expect(hasMinimumPlatformRole("student", "coach")).toBe(false);
  });

  it("locks every learning feature on for Coach and Admin only", () => {
    expect(hasFullFeatureAccess("coach")).toBe(true);
    expect(hasFullFeatureAccess("admin")).toBe(true);
    expect(hasFullFeatureAccess("operations")).toBe(false);
    expect(hasFullFeatureAccess("consultant")).toBe(false);
    expect(hasFullFeatureAccess("temp")).toBe(false);
  });

  it("keeps feature metadata aligned with every permission key", () => {
    expect(FEATURE_DEFINITIONS.map(({ key }) => key)).toEqual(FEATURE_KEYS);
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  it("rejects stale or unknown role values", () => {
    expect(normalizePlatformRole("operations")).toBe("operations");
    expect(normalizePlatformRole("manager")).toBeNull();
    expect(normalizePlatformRole(undefined)).toBeNull();
  });

  it("never lets stale invitation metadata downgrade an existing staff role", () => {
    expect(resolveNonDowngradingPlatformRole("coach", "student")).toBe("coach");
    expect(resolveNonDowngradingPlatformRole("admin", "coach")).toBe("admin");
    expect(resolveNonDowngradingPlatformRole("coach", "operations")).toBe("coach");
    expect(resolveNonDowngradingPlatformRole("student", "coach")).toBe("coach");
  });
});
