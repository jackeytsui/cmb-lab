import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptVideoAskSecret,
  encryptVideoAskSecret,
} from "../crypto";

const TEST_KEY = "a".repeat(64);
const ORIGINAL_KEY = process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY;

describe("VideoAsk credential encryption", () => {
  beforeEach(() => {
    process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY;
    } else {
      process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
    }
  });

  it("round-trips a secret without storing plaintext", () => {
    const secret = "refresh-token-value";
    const encrypted = encryptVideoAskSecret(secret);

    expect(encrypted).not.toContain(secret);
    expect(encrypted).toMatch(/^v1\./);
    expect(decryptVideoAskSecret(encrypted)).toBe(secret);
  });

  it("uses a new nonce for every encrypted value", () => {
    expect(encryptVideoAskSecret("same-token")).not.toBe(
      encryptVideoAskSecret("same-token"),
    );
  });

  it("rejects tampered encrypted credentials", () => {
    const encrypted = encryptVideoAskSecret("refresh-token");
    expect(() => decryptVideoAskSecret(`${encrypted}x`)).toThrow(
      "could not be decrypted",
    );
  });

  it("rejects an incorrectly sized encryption key", () => {
    process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => encryptVideoAskSecret("refresh-token")).toThrow(
      "must be 32 bytes",
    );
  });
});
