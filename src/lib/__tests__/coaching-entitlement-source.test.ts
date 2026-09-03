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

  it("preserves legacy 1:1 eligibility while treating GHL as additive", () => {
    const provisioning = source("src/lib/post-purchase-provisioning.ts");
    const tagSync = source("src/lib/ghl/tag-sync.ts");

    expect(provisioning).toContain("activeStudents.col1on1Eligibility");
    expect(provisioning).toContain("activeStudents.col1on1EndDate");
    expect(provisioning).toContain("oneOnOneEligibilityActive");
    expect(provisioning).toContain("current_date");
    expect(tagSync).not.toContain("activeStudents.col1on1Eligibility");
    expect(tagSync).toContain('reason: "additive_access_policy"');
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

  it("keeps a student's own historical 1:1 material visible without granting an active package", () => {
    const layout = source("src/app/(dashboard)/layout.tsx");
    const featureAccess = source("src/lib/feature-access.ts");
    const historyAccess = source("src/lib/coaching-history-access.ts");
    const sessionsRoute = source("src/app/api/coaching/sessions/route.ts");

    expect(layout).toContain("hasOneOnOneCoachingHistory");
    expect(featureAccess).toContain("hasOneOnOneCoachingHistory");
    expect(featureAccess).toContain('feature === "one_on_one_coaching"');
    expect(historyAccess).toContain('eq(coachingSessions.type, "one_on_one")');
    expect(historyAccess).toContain("lower(trim(");
    expect(sessionsRoute).toContain("ilike(coachingSessions.studentEmail, studentEmail)");
    expect(sessionsRoute).toContain('hasMinimumRole("coach")');
  });
});
