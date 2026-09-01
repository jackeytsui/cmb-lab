export type GroupCoachingSessionState =
  | "cancelled"
  | "upcoming"
  | "live"
  | "past";

export type GroupCoachingReminderKey =
  | "one_hour"
  | "starting_now";

type SessionTiming = {
  startsAt: string | Date;
  durationMinutes: number;
  isCancelled?: boolean;
};

export function groupCoachingSessionState(
  session: SessionTiming,
  nowMs: number,
): GroupCoachingSessionState {
  if (session.isCancelled) return "cancelled";

  const startsAtMs = new Date(session.startsAt).getTime();
  const endsAtMs = startsAtMs + session.durationMinutes * 60_000;
  if (nowMs >= startsAtMs && nowMs < endsAtMs) return "live";
  if (nowMs < startsAtMs) return "upcoming";
  return "past";
}

/**
 * Match the one-minute production cron to the two requested idempotent slots:
 * the one-hour window and the moment the session goes live.
 */
export function groupCoachingReminderKey(
  startsAt: string | Date,
  nowMs: number,
): GroupCoachingReminderKey | null {
  const deltaMinutes = (new Date(startsAt).getTime() - nowMs) / 60_000;
  if (deltaMinutes <= 0 && deltaMinutes > -5) return "starting_now";
  if (deltaMinutes <= 60 && deltaMinutes > 55) return "one_hour";
  return null;
}

export function isGroupCoachingReminderBannerVisible(
  session: SessionTiming,
  nowMs: number,
): boolean {
  const state = groupCoachingSessionState(session, nowMs);
  if (state === "live") return true;
  if (state !== "upcoming") return false;

  const startsAtMs = new Date(session.startsAt).getTime();
  return startsAtMs - nowMs <= 60 * 60_000;
}
