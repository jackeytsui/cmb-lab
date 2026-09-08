import { describe, expect, it } from "vitest";
import { podcastTokenFingerprint } from "@/lib/podcast-delivery-log";

describe("podcast delivery logging", () => {
  it("creates a stable correlation value without exposing the private token", () => {
    const token = "a".repeat(64);
    const fingerprint = podcastTokenFingerprint(token);

    expect(fingerprint).toHaveLength(12);
    expect(fingerprint).toBe(podcastTokenFingerprint(token));
    expect(token).not.toContain(fingerprint);
  });
});
