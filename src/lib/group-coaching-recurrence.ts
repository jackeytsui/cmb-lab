import { TZDate } from "@date-fns/tz";

export const COACHING_SOURCE_TIME_ZONE = "America/Toronto";
export const COACHING_SCHEDULE_HORIZON_WEEKS = 16;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKLY_RECURRENCE_PATTERN =
  /^\s*Repeats every (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/im;
const CANCELLED_OCCURRENCE_PATTERN =
  /^\s*Cancelled on (\d{4}-\d{2}-\d{2})\s*$/i;
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type CoachingEventLike = {
  id: string;
  description: string;
  startsAt: Date;
  isCancelled?: boolean;
};

export type CoachingOccurrence<T extends CoachingEventLike> = Omit<
  T,
  "id" | "startsAt" | "isCancelled"
> & {
  id: string;
  sourceEventId: string;
  startsAt: Date;
  isCancelled: boolean;
};

export type CoachingOccurrenceWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function isWeeklyCoachingEvent(description: string): boolean {
  return WEEKLY_RECURRENCE_PATTERN.test(description);
}

export function cancelledCoachingDateKeys(description: string): string[] {
  const keys = new Set<string>();
  for (const line of description.split("\n")) {
    const dateKey = line.match(CANCELLED_OCCURRENCE_PATTERN)?.[1];
    if (dateKey) keys.add(dateKey);
  }
  return [...keys].sort();
}

export function setCoachingOccurrenceCancelled(
  description: string,
  dateKey: string,
  cancelled: boolean,
): string {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error("Cancellation date must use YYYY-MM-DD");
  }

  const dates = new Set(cancelledCoachingDateKeys(description));
  if (cancelled) dates.add(dateKey);
  else dates.delete(dateKey);

  const content = description
    .split("\n")
    .filter((line) => !CANCELLED_OCCURRENCE_PATTERN.test(line))
    .join("\n")
    .trimEnd();
  const metadata = [...dates].sort().map((date) => `Cancelled on ${date}`);
  return [content, ...metadata].filter(Boolean).join("\n");
}

function torontoDateKey(value: Date): string {
  const date = new TZDate(value, COACHING_SOURCE_TIME_ZONE);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isCoachingOccurrenceDate(
  event: CoachingEventLike,
  dateKey: string,
): boolean {
  if (
    !DATE_KEY_PATTERN.test(dateKey) ||
    !isWeeklyCoachingEvent(event.description)
  ) {
    return false;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const requestedDate = new TZDate(
    year,
    month - 1,
    day,
    12,
    0,
    COACHING_SOURCE_TIME_ZONE,
  );
  const firstDate = new TZDate(event.startsAt, COACHING_SOURCE_TIME_ZONE);
  const firstDay = new TZDate(
    firstDate.getFullYear(),
    firstDate.getMonth(),
    firstDate.getDate(),
    12,
    0,
    COACHING_SOURCE_TIME_ZONE,
  );
  return (
    torontoDateKey(requestedDate) === dateKey &&
    requestedDate.getTime() >= firstDay.getTime() &&
    requestedDate.getDay() === firstDay.getDay()
  );
}

function weeklyOccurrenceAt(source: Date, weekIndex: number): Date {
  const occurrence = new TZDate(source, COACHING_SOURCE_TIME_ZONE);
  occurrence.setDate(occurrence.getDate() + weekIndex * 7);
  return new Date(occurrence.getTime());
}

function occurrenceId(sourceEventId: string, startsAt: Date): string {
  return `${sourceEventId}:weekly:${startsAt.toISOString()}`;
}

/**
 * Expand schedule templates into concrete occurrences for a bounded window.
 *
 * Existing ICGC rows describe recurrence with a `Repeats every <weekday>` line.
 * Recurrences advance in Toronto calendar time so the advertised local hour is
 * preserved across daylight-saving changes.
 */
export function expandCoachingOccurrences<T extends CoachingEventLike>(
  events: readonly T[],
  window: CoachingOccurrenceWindow,
): CoachingOccurrence<T>[] {
  if (window.endsAt < window.startsAt) return [];

  const occurrences: CoachingOccurrence<T>[] = [];

  for (const event of events) {
    const cancelledDates = new Set(cancelledCoachingDateKeys(event.description));
    if (!isWeeklyCoachingEvent(event.description)) {
      if (event.startsAt >= window.startsAt && event.startsAt <= window.endsAt) {
        occurrences.push({
          ...event,
          sourceEventId: event.id,
          isCancelled: Boolean(event.isCancelled),
        });
      }
      continue;
    }

    // Start close to the requested window, then correct using Toronto calendar
    // arithmetic. The one-week buffer accounts for UTC offset changes at DST.
    const approximateWeek = Math.max(
      0,
      Math.floor((window.startsAt.getTime() - event.startsAt.getTime()) / WEEK_MS) - 1,
    );
    let weekIndex = approximateWeek;
    let startsAt = weeklyOccurrenceAt(event.startsAt, weekIndex);

    while (startsAt < window.startsAt) {
      weekIndex += 1;
      startsAt = weeklyOccurrenceAt(event.startsAt, weekIndex);
    }

    // The public schedule uses a 16-week window and reminders use a one-hour
    // window. This guard also keeps malformed, unbounded input from looping.
    for (let count = 0; startsAt <= window.endsAt && count < 520; count += 1) {
      occurrences.push({
        ...event,
        id: occurrenceId(event.id, startsAt),
        sourceEventId: event.id,
        startsAt,
        isCancelled:
          Boolean(event.isCancelled) || cancelledDates.has(torontoDateKey(startsAt)),
      });
      weekIndex += 1;
      startsAt = weeklyOccurrenceAt(event.startsAt, weekIndex);
    }
  }

  return occurrences.sort(
    (left, right) =>
      left.startsAt.getTime() - right.startsAt.getTime() ||
      left.id.localeCompare(right.id),
  );
}
