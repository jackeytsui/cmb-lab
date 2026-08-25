export const PORTAL_EXPIRY_TIME_ZONE = "America/Toronto";

export type PortalExpiryReason =
  | "expired"
  | "already_expired"
  | "missing_end_date"
  | "invalid_end_date"
  | "not_ended";

export type PortalExpiryDecision = {
  courseEndDate: string | null;
  reason: PortalExpiryReason;
  shouldExpire: boolean;
};

function dateKeyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeDateKey(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const dateKey = match[1];
  const parsed = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateKey) {
    return null;
  }
  return dateKey;
}

export function getPortalExpiryDecision(
  metadata: Record<string, unknown>,
  now = new Date(),
): PortalExpiryDecision {
  if (metadata.cmbPortalAccessStatus === "expired") {
    return {
      courseEndDate: normalizeDateKey(metadata.cmbCourseEndDate),
      reason: "already_expired",
      shouldExpire: false,
    };
  }

  if (metadata.cmbCourseEndDate == null || metadata.cmbCourseEndDate === "") {
    return {
      courseEndDate: null,
      reason: "missing_end_date",
      shouldExpire: false,
    };
  }

  const courseEndDate = normalizeDateKey(metadata.cmbCourseEndDate);
  if (!courseEndDate) {
    return {
      courseEndDate: null,
      reason: "invalid_end_date",
      shouldExpire: false,
    };
  }

  const today = dateKeyInTimeZone(now, PORTAL_EXPIRY_TIME_ZONE);
  if (courseEndDate >= today) {
    return {
      courseEndDate,
      reason: "not_ended",
      shouldExpire: false,
    };
  }

  return { courseEndDate, reason: "expired", shouldExpire: true };
}

export function buildExpiredPortalMetadata(
  metadata: Record<string, unknown>,
  now = new Date(),
) {
  return {
    ...metadata,
    cmbPortalAccessStatus: "expired",
    cmbPortalAccessRevoked: true,
    cmbPortalAccessRevokedAt: now.toISOString(),
    cmbPortalAccessRevokedReason: "course_end_date_expired",
  };
}
