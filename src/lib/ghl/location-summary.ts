export type GhlLocationSummaryInput = {
  apiToken?: string | null;
  webhookSecret?: string | null;
  [key: string]: unknown;
};

/**
 * Credentials are write-only. Admin clients only need to know whether each
 * value is configured; returning the value itself makes every browser session
 * an unnecessary secret-disclosure surface.
 */
export function toGhlLocationSummary<T extends GhlLocationSummaryInput>(
  location: T,
) {
  const {
    apiToken,
    webhookSecret,
    ...safeLocation
  } = location;

  return {
    ...safeLocation,
    hasApiToken: Boolean(apiToken),
    hasWebhookSecret: Boolean(webhookSecret),
  };
}
