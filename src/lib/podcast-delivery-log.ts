import { createHash } from "node:crypto";

type PodcastDeliveryRoute = "feed" | "audio";

interface PodcastDeliveryFailure {
  route: PodcastDeliveryRoute;
  reason: string;
  token: string;
  seriesId?: string;
  lessonId?: string;
}

/** Stable correlation value for logs that never reveals the private feed token. */
export function podcastTokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

export function logPodcastDeliveryFailure({
  token,
  ...details
}: PodcastDeliveryFailure): void {
  console.warn(
    "[podcast-delivery]",
    JSON.stringify({
      event: "podcast_delivery_failed",
      ...details,
      tokenFingerprint: podcastTokenFingerprint(token),
    }),
  );
}
