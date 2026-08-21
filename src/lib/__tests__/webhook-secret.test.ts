import { describe, expect, it } from "vitest";
import { webhookSecretsMatch } from "@/lib/webhook-secret";

describe("webhookSecretsMatch", () => {
  it("fails closed when either secret is missing", () => {
    expect(webhookSecretsMatch(null, undefined)).toBe(false);
    expect(webhookSecretsMatch("provided", undefined)).toBe(false);
    expect(webhookSecretsMatch(null, "configured")).toBe(false);
  });

  it("accepts an exact configured secret", () => {
    expect(webhookSecretsMatch("correct-secret", "correct-secret")).toBe(true);
  });

  it("rejects mismatched values and lengths", () => {
    expect(webhookSecretsMatch("correct-secret", "wrong-secret!")).toBe(false);
    expect(webhookSecretsMatch("short", "much-longer")).toBe(false);
  });
});
