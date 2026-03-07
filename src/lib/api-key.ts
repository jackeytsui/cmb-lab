import "server-only";
import crypto from "crypto";

export function generateApiKeySecret() {
  return `cmb_live_${crypto.randomBytes(24).toString("base64url")}`;
}

export function hashApiKey(rawKey: string) {
  return crypto.createHash("sha256").update(rawKey).digest("hex");
}

export function apiKeyPrefix(rawKey: string) {
  return rawKey.slice(0, 18);
}

export function maskApiKeyPrefix(prefix: string) {
  return `${prefix}...`;
}
