import { timingSafeEqual } from "crypto";

/** Constant-time, fail-closed comparison for inbound webhook secrets. */
export function webhookSecretsMatch(
  provided: string | null | undefined,
  configured: string | null | undefined,
): boolean {
  if (!provided || !configured) return false;
  const providedBuffer = Buffer.from(provided);
  const configuredBuffer = Buffer.from(configured);
  return (
    providedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(providedBuffer, configuredBuffer)
  );
}
