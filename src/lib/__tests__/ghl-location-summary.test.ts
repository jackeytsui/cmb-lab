import { describe, expect, it } from "vitest";
import { toGhlLocationSummary } from "@/lib/ghl/location-summary";

describe("toGhlLocationSummary", () => {
  it("returns configuration indicators without exposing credentials", () => {
    const summary = toGhlLocationSummary({
      id: "location-id",
      name: "Course",
      apiToken: "private-api-token",
      webhookSecret: "private-webhook-secret",
    });

    expect(summary).toEqual({
      id: "location-id",
      name: "Course",
      hasApiToken: true,
      hasWebhookSecret: true,
    });
    expect(summary).not.toHaveProperty("apiToken");
    expect(summary).not.toHaveProperty("webhookSecret");
  });

  it("accurately reports missing credentials", () => {
    expect(
      toGhlLocationSummary({ apiToken: null, webhookSecret: null }),
    ).toEqual({ hasApiToken: false, hasWebhookSecret: false });
  });
});
