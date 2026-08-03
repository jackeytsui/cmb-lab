// src/lib/ghl/webhook-auth.ts
// Helpers for authenticating inbound GHL webhooks.
//
// GHL Custom Webhook actions are configured by hand in the workflow builder,
// so keys, values, and secrets routinely arrive with stray whitespace
// (we've seen real payloads with keys like "type  "). Normalize everything
// before comparing, and accept the secret from either the x-webhook-secret
// header or a body field for workflows that can't set custom headers.

// Body keys we accept the shared secret under (checked in order).
const SECRET_BODY_KEYS = [
  "x-webhook-secret",
  "webhookSecret",
  "webhook_secret",
  "secret",
];

/**
 * Trim whitespace from all keys and string values of a parsed webhook body.
 * Non-string values are passed through untouched.
 */
export function normalizeWebhookBody(
  body: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    normalized[key.trim()] = typeof value === "string" ? value.trim() : value;
  }
  return normalized;
}

/**
 * Pull a shared secret out of the webhook body, removing every candidate
 * field so the secret can never end up in logs. Returns the first non-empty
 * value found, or null.
 */
export function extractSecretFromBody(
  body: Record<string, unknown>
): string | null {
  let found: string | null = null;
  for (const key of SECRET_BODY_KEYS) {
    const value = body[key];
    if (found === null && typeof value === "string" && value.trim() !== "") {
      found = value.trim();
    }
    delete body[key];
  }
  return found;
}

/**
 * Whitespace-tolerant secret comparison. Returns true when the provided
 * secret matches any of the expected candidates. Empty/missing values never
 * match — an unset secret must not authenticate anything.
 */
export function secretMatches(
  provided: string | null | undefined,
  expected: Array<string | null | undefined>
): boolean {
  const candidate = provided?.trim();
  if (!candidate) return false;
  return expected.some(
    (s) => typeof s === "string" && s.trim() !== "" && s.trim() === candidate
  );
}
