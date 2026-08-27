import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("coaching entitlement source of truth", () => {
  it("never grants coaching add-on tags during a dashboard visit", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const coachingAccess = source("src/lib/coaching-access.ts");

    expect(layout).not.toContain("assignBaselineCoachingTagsToStudents");
    expect(coachingAccess).not.toContain(
      "assignBaselineCoachingTagsToStudents",
    );
  });

  it("uses post-purchase reconciliation for the legacy coaching backfill", () => {
    const backfill = source(
      "src/app/api/admin/students/backfill-coaching-tags/route.ts",
    );

    expect(backfill).toContain("reconcilePostPurchaseEntitlements");
    expect(backfill).toContain('source: "post_purchase_entitlements"');
    expect(backfill).not.toContain("activeIds");
  });

  it("reports effective access after tag overrides in admin attribution", () => {
    const route = source("src/app/api/admin/roles/analytics/route.ts");
    const panel = source(
      "src/components/admin/StudentAccessAttribution.tsx",
    );

    expect(route).toContain("applyFeatureTagOverrides");
    expect(route).toContain("effectiveFeatures");
    expect(panel).toContain("Effective feature access");
    expect(panel).toContain("Removed by tags");
  });
});
