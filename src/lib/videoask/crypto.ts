import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";
const IV_BYTES = 12;
const KEY_BYTES = 32;

function getEncryptionKey(): Buffer {
  const configured = process.env.VIDEOASK_TOKEN_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new Error("VIDEOASK_TOKEN_ENCRYPTION_KEY is not configured");
  }

  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (key.length !== KEY_BYTES) {
    throw new Error(
      "VIDEOASK_TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters or base64)",
    );
  }

  return key;
}
export function encryptVideoAskSecret(plaintext: string): string {
  if (!plaintext) throw new Error("Cannot encrypt an empty VideoAsk secret");

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptVideoAskSecret(payload: string): string {
  const [version, ivValue, tagValue, encryptedValue, ...extra] =
    payload.split(".");

  if (
    version !== VERSION ||
    !ivValue ||
    !tagValue ||
    !encryptedValue ||
    extra.length > 0
  ) {
    throw new Error("Stored VideoAsk credential has an unsupported format");
  }

  try {
    const decipher = createDecipheriv(
      ALGORITHM,
      getEncryptionKey(),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error(
      "Stored VideoAsk credential could not be decrypted; verify VIDEOASK_TOKEN_ENCRYPTION_KEY",
    );
  }
}
