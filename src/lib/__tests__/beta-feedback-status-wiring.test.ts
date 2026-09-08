import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const adminRoute = readFileSync(
  "src/app/api/admin/beta-feedback/route.ts",
  "utf8",
);
const studentRoute = readFileSync("src/app/api/beta-feedback/route.ts", "utf8");

describe("beta feedback status notification wiring", () => {
  it("atomically changes the stage and creates the in-app notification", () => {
    expect(adminRoute).toContain("WITH updated_feedback AS");
    expect(adminRoute).toContain("created_notification AS");
    expect(adminRoute).toContain("feedback.status = ${current.status}");
    expect(adminRoute).toContain("notification_preferences.muted = TRUE");
  });

  it("uses a deterministic transition idempotency key for email", () => {
    expect(adminRoute).toContain("idempotencyKey: `beta-feedback-${current.id}-");
  });

  it("limits request history to the authenticated submitter and keeps notes private", () => {
    expect(studentRoute).toContain("eq(betaFeedback.userId, user.id)");
    const getHandler = studentRoute.slice(
      studentRoute.indexOf("export async function GET"),
      studentRoute.indexOf("export async function POST"),
    );
    expect(getHandler).not.toContain("adminNote:");
    expect(getHandler).not.toContain("reviewedBy:");
  });
});
