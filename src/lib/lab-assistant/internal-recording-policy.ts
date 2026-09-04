import type { PlatformRole } from "@/lib/platform-roles";

export const INTERNAL_RECORDING_ROLES = [
  "admin",
  "coach",
  "consultant",
] as const;

export type InternalRecordingRole =
  (typeof INTERNAL_RECORDING_ROLES)[number];

export type RecordingStudentCandidate = {
  id: string;
  name: string | null;
  email: string;
};

export function canUseInternalRecordingFinder(
  role: PlatformRole | null | undefined,
): role is InternalRecordingRole {
  return INTERNAL_RECORDING_ROLES.includes(role as InternalRecordingRole);
}

function validDateKey(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isValidDateKey(value: string): boolean {
  const match = value.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  return Boolean(
    match &&
      validDateKey(Number(match[1]), Number(match[2]), Number(match[3])) ===
        value,
  );
}

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/** Recover the lesson date from common historical ICGC title formats. */
export function recordingDateFromTitle(title: string): string | null {
  const compact = title.match(/(?:^|\D)(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])(?:\D|$)/);
  if (compact) {
    return validDateKey(Number(compact[1]), Number(compact[2]), Number(compact[3]));
  }

  const yearFirst = title.match(
    /(?:^|\D)(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})(?:\D|$)/,
  );
  if (yearFirst) {
    return validDateKey(
      Number(yearFirst[1]),
      Number(yearFirst[2]),
      Number(yearFirst[3]),
    );
  }

  const monthFirst = title.match(
    /(?:^|\D)(\d{1,2})[-_/](\d{1,2})[-_/](20\d{2})(?:\D|$)/,
  );
  if (monthFirst) {
    return validDateKey(
      Number(monthFirst[3]),
      Number(monthFirst[1]),
      Number(monthFirst[2]),
    );
  }

  const namedMonth = title.match(
    /(?:^|\W)(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s._-]+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s|[._-])+(20\d{2})(?:\W|$)/i,
  );
  if (namedMonth) {
    return validDateKey(
      Number(namedMonth[3]),
      MONTHS[namedMonth[1].toLowerCase()],
      Number(namedMonth[2]),
    );
  }

  return null;
}

export function safeTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "America/Toronto";
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return timeZone;
  } catch {
    return "America/Toronto";
  }
}

export function dateKeyInTimeZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: safeTimeZone(timeZone),
  }).format(date);
}

export function recordingMatchesDate(
  session: { title: string; createdAt: Date },
  requestedDate: string,
  actorTimeZone: string,
): boolean {
  const possibleDates = new Set([
    recordingDateFromTitle(session.title),
    dateKeyInTimeZone(session.createdAt, actorTimeZone),
    dateKeyInTimeZone(session.createdAt, "America/Toronto"),
  ]);
  return possibleDates.has(requestedDate);
}

/** Prefer an exact email/name; otherwise require a single partial match. */
export function selectStudentCandidate(
  candidates: readonly RecordingStudentCandidate[],
  query: string,
):
  | { status: "found"; student: RecordingStudentCandidate }
  | { status: "not_found" }
  | { status: "ambiguous"; candidates: RecordingStudentCandidate[] } {
  if (candidates.length === 0) return { status: "not_found" };

  const normalized = query.trim().toLowerCase();
  const exact = candidates.filter(
    (candidate) =>
      candidate.email.trim().toLowerCase() === normalized ||
      candidate.name?.trim().toLowerCase() === normalized,
  );
  if (exact.length === 1) return { status: "found", student: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", candidates: exact };
  if (candidates.length === 1) {
    return { status: "found", student: candidates[0] };
  }
  return { status: "ambiguous", candidates: [...candidates] };
}
