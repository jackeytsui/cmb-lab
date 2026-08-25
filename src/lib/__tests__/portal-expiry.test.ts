import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildExpiredPortalMetadata,
  getPortalExpiryDecision,
} from "@/lib/portal-expiry";

const now = new Date("2026-08-24T16:00:00.000Z");

describe("portal expiry policy", () => {
  it("expires a student only after the Toronto end date has passed", () => {
    expect(
      getPortalExpiryDecision(
        { cmbPortalAccessStatus: "active", cmbCourseEndDate: "2026-08-23" },
        now,
      ),
    ).toMatchObject({ shouldExpire: true, reason: "expired" });

    expect(
      getPortalExpiryDecision(
        { cmbPortalAccessStatus: "active", cmbCourseEndDate: "2026-08-24" },
        now,
      ),
    ).toMatchObject({ shouldExpire: false, reason: "not_ended" });
  });

  it("leaves lifetime, malformed, and already-expired records alone", () => {
    expect(getPortalExpiryDecision({}, now).reason).toBe("missing_end_date");
    expect(
      getPortalExpiryDecision({ cmbCourseEndDate: "not-a-date" }, now).reason,
    ).toBe("invalid_end_date");
    expect(
      getPortalExpiryDecision(
        { cmbPortalAccessStatus: "expired", cmbCourseEndDate: "2026-08-01" },
        now,
      ).reason,
    ).toBe("already_expired");
  });

  it("preserves unrelated metadata while applying the canonical expired state", () => {
    expect(
      buildExpiredPortalMetadata({ role: "student", custom: "keep" }, now),
    ).toEqual({
      role: "student",
      custom: "keep",
      cmbPortalAccessStatus: "expired",
      cmbPortalAccessRevoked: true,
      cmbPortalAccessRevokedAt: now.toISOString(),
      cmbPortalAccessRevokedReason: "course_end_date_expired",
    });
  });
});

describe("portal expiry cron configuration", () => {
  it("runs daily and requires the shared cron secret", () => {
    const config = JSON.parse(
      readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons: Array<{ path: string; schedule: string }> };
    const job = config.crons.find((item) => item.path === "/api/cron/portal-expiry");
    const source = readFileSync(
      path.join(process.cwd(), "src/app/api/cron/portal-expiry/route.ts"),
      "utf8",
    );

    expect(job?.schedule).toBe("0 9 * * *");
    expect(source).toContain("getCronSecret(process.env.CRON_SECRET)");
    expect(source).toContain('process.env.VERCEL_ENV === "production"');
    expect(source).toContain('{ status: 503 }');
  });
});
