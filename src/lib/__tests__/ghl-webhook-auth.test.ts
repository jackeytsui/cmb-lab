import { describe, it, expect } from "vitest";
import {
  normalizeWebhookBody,
  extractSecretFromBody,
  secretMatches,
} from "@/lib/ghl/webhook-auth";

describe("normalizeWebhookBody", () => {
  it("trims whitespace from keys (real GHL payload shape)", () => {
    // Seen in production: GHL Custom Webhook configured with a trailing
    // space in the key name — {"type  ":"ContactTagUpdate",...}
    const body = normalizeWebhookBody({
      "type  ": "ContactTagUpdate",
      id: "S5CIVBTaEQ1AyTUSTNLn",
      locationId: "JOdDwlRF2K16cnIYW9Er",
      tags: "",
    });
    expect(body.type).toBe("ContactTagUpdate");
    expect(body.id).toBe("S5CIVBTaEQ1AyTUSTNLn");
  });

  it("trims whitespace from string values, passes non-strings through", () => {
    const body = normalizeWebhookBody({
      id: "  abc  ",
      tags: ["x"],
      count: 3,
    });
    expect(body.id).toBe("abc");
    expect(body.tags).toEqual(["x"]);
    expect(body.count).toBe(3);
  });
});

describe("extractSecretFromBody", () => {
  it("returns the secret and strips all secret fields from the body", () => {
    const body: Record<string, unknown> = {
      id: "abc",
      webhook_secret: "s3cret",
      secret: "other",
    };
    expect(extractSecretFromBody(body)).toBe("s3cret");
    expect(body).toEqual({ id: "abc" });
  });

  it("returns null when no secret field is present", () => {
    const body: Record<string, unknown> = { id: "abc" };
    expect(extractSecretFromBody(body)).toBeNull();
  });

  it("ignores empty-string secrets", () => {
    const body: Record<string, unknown> = { secret: "  " };
    expect(extractSecretFromBody(body)).toBeNull();
  });
});

describe("secretMatches", () => {
  it("matches against any expected candidate", () => {
    expect(secretMatches("abc", ["abc", "def"])).toBe(true);
    expect(secretMatches("def", ["abc", "def"])).toBe(true);
    expect(secretMatches("xyz", ["abc", "def"])).toBe(false);
  });

  it("tolerates copy-paste whitespace on either side", () => {
    expect(secretMatches("abc\n", ["abc"])).toBe(true);
    expect(secretMatches("abc", [" abc "])).toBe(true);
  });

  it("never authenticates when the provided secret is missing or empty", () => {
    expect(secretMatches(null, ["abc"])).toBe(false);
    expect(secretMatches(undefined, ["abc"])).toBe(false);
    expect(secretMatches("", ["abc"])).toBe(false);
    expect(secretMatches("   ", ["abc"])).toBe(false);
  });

  it("never authenticates against unset or empty expected secrets", () => {
    // e.g. GHL_INBOUND_WEBHOOK_SECRET not configured in the environment
    expect(secretMatches("undefined", [undefined, null])).toBe(false);
    expect(secretMatches("", ["", null])).toBe(false);
    expect(secretMatches(" ", [" "])).toBe(false);
  });
});
