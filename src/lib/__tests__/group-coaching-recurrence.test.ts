import { describe, expect, it } from "vitest";
import {
  expandCoachingOccurrences,
  isWeeklyCoachingEvent,
} from "@/lib/group-coaching-recurrence";

const weeklyEvent = {
  id: "event-friday",
  title: "Friday Inner Circle Group Coaching",
  description: "Sign up here: https://example.com\nRepeats every Friday (ICGC event).",
  startsAt: new Date("2026-08-21T18:00:00.000Z"),
};

describe("group coaching recurrence", () => {
  it("recognizes explicit weekly recurrence lines without matching unrelated copy", () => {
    expect(isWeeklyCoachingEvent(weeklyEvent.description)).toBe(true);
    expect(isWeeklyCoachingEvent("Please repeat every sentence twice.")).toBe(false);
  });

  it("keeps an expired weekly template visible through future occurrences", () => {
    const occurrences = expandCoachingOccurrences([weeklyEvent], {
      startsAt: new Date("2026-08-28T00:00:00.000Z"),
      endsAt: new Date("2026-09-12T00:00:00.000Z"),
    });

    expect(occurrences.map((event) => event.startsAt.toISOString())).toEqual([
      "2026-08-28T18:00:00.000Z",
      "2026-09-04T18:00:00.000Z",
      "2026-09-11T18:00:00.000Z",
    ]);
    expect(occurrences.every((event) => event.sourceEventId === weeklyEvent.id)).toBe(true);
    expect(new Set(occurrences.map((event) => event.id)).size).toBe(3);
  });

  it("preserves Toronto wall-clock time across daylight-saving changes", () => {
    const event = {
      ...weeklyEvent,
      startsAt: new Date("2026-10-30T22:00:00.000Z"),
    };
    const occurrences = expandCoachingOccurrences([event], {
      startsAt: new Date("2026-10-30T00:00:00.000Z"),
      endsAt: new Date("2026-11-14T00:00:00.000Z"),
    });

    expect(occurrences.map((item) => item.startsAt.toISOString())).toEqual([
      "2026-10-30T22:00:00.000Z",
      "2026-11-06T23:00:00.000Z",
      "2026-11-13T23:00:00.000Z",
    ]);
  });

  it("does not repeat ordinary one-off sessions", () => {
    const event = { ...weeklyEvent, description: "One-time workshop" };
    expect(
      expandCoachingOccurrences([event], {
        startsAt: new Date("2026-08-22T00:00:00.000Z"),
        endsAt: new Date("2026-09-30T00:00:00.000Z"),
      }),
    ).toEqual([]);
  });
});
