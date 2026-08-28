import { TZDate } from "@date-fns/tz";

export const COACHING_SOURCE_TIME_ZONE = "America/Toronto";
export const COACHING_SCHEDULE_HORIZON_WEEKS = 16;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKLY_RECURRENCE_PATTERN =
  /^\s*Repeats every (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/im;

type CoachingEventLike = {
  id: string;
  description: string;
  startsAt: Date;
};

export type CoachingOccurrence<T extends CoachingEventLike> = Omit<T, "id" | "startsAt"> & {
  id: string;
  sourceEventId: string;
  startsAt: Date;
};

export type CoachingOccurrenceWindow = {
  startsAt: Date;
  endsAt: Date;
};

export function isWeeklyCoachingEvent(description: string): boolean {
  return WEEKLY_RECURRENCE_PATTERN.test(description);
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
 * Weekly recurrences advance in Toronto calendar time so the advertised local
 * hour remains stable through daylight-saving changes.
 */
export function expandCoachingOccurrences<T extends CoachingEventLike>(
  events: readonly T[],
  window: CoachingOccurrenceWindow,
): CoachingOccurrence<T>[] {
  if (window.endsAt < window.startsAt) return [];

  const occurrences: CoachingOccurrence<T>[] = [];

  for (const event of events) {
    if (!isWeeklyCoachingEvent(event.description)) {
      if (event.startsAt >= window.startsAt && event.startsAt <= window.endsAt) {
        occurrences.push({ ...event, sourceEventId: event.id });
      }
      continue;
    }

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

    for (let count = 0; startsAt <= window.endsAt && count < 520; count += 1) {
      occurrences.push({
        ...event,
        id: occurrenceId(event.id, startsAt),
        sourceEventId: event.id,
        startsAt,
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
