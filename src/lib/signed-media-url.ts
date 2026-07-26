import { createHmac, timingSafeEqual } from "crypto";

// ============================================================
// Short-lived HMAC signatures for first-party media proxy URLs
// (course-library video streaming). A URL copied out of dev tools
// stops working once the signature expires, instead of remaining a
// permanent download link for anyone holding the student's session.
// ============================================================

/**
 * How long a signed media URL stays valid. Long enough to cover a full
 * study session (the player issues range requests against the same URL for
 * as long as the lesson page stays open); short enough that captured URLs
 * go dead the same day. Page refresh mints a fresh signature.
 */
export const SIGNED_MEDIA_TTL_SECONDS = 6 * 60 * 60;

function signingSecret(): string {
  const secret =
    process.env.MEDIA_URL_SIGNING_SECRET ||
    process.env.BLOB_READ_WRITE_TOKEN ||
    process.env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "No secret available for media URL signing (set MEDIA_URL_SIGNING_SECRET)",
    );
  }
  return secret;
}

function computeSignature(path: string, exp: number): string {
  return createHmac("sha256", signingSecret())
    .update(`${path}\n${exp}`)
    .digest("hex");
}

/**
 * Returns `path?exp=...&sig=...` — the path plus an expiry timestamp and an
 * HMAC binding the two together. Server-side only.
 */
export function signMediaPath(
  path: string,
  ttlSeconds: number = SIGNED_MEDIA_TTL_SECONDS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  return `${path}?exp=${exp}&sig=${computeSignature(path, exp)}`;
}

/** Verifies the exp/sig pair produced by signMediaPath for this path. */
export function verifySignedMediaPath(
  path: string,
  exp: string | null,
  sig: string | null,
): boolean {
  if (!exp || !sig) return false;
  const expNum = Number(exp);
  if (!Number.isInteger(expNum)) return false;
  if (expNum * 1000 < Date.now()) return false;
  const expected = computeSignature(path, expNum);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
