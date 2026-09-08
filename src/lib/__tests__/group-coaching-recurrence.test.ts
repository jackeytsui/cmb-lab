import { describe, expect, it } from "vitest";
import {
  cancelledCoachingDateKeys,
  expandCoachingOccurrences,
  isCoachingOccurrenceDate,
  isWeeklyCoachingEvent,
  setCoachingOccurrenceCancelled,
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
      startsAt: new Date("2026-10-30T22:00:00.000Z"), // 6:00 PM Toronto (EDT)
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

  it("cancels only the selected Toronto occurrence", () => {
    const description = setCoachingOccurrenceCancelled(
      weeklyEvent.description,
      "2026-09-04",
      true,
    );
    const occurrences = expandCoachingOccurrences(
      [{ ...weeklyEvent, description, isCancelled: false }],
      {
        startsAt: new Date("2026-08-28T00:00:00.000Z"),
        endsAt: new Date("2026-09-12T00:00:00.000Z"),
      },
    );

    expect(occurrences.map((event) => event.isCancelled)).toEqual([
      false,
      true,
      false,
    ]);
    expect(cancelledCoachingDateKeys(description)).toEqual(["2026-09-04"]);
    expect(
      cancelledCoachingDateKeys(
        setCoachingOccurrenceCancelled(description, "2026-09-04", false),
      ),
    ).toEqual([]);
  });

  it("accepts only dates that belong to the weekly series", () => {
    expect(isCoachingOccurrenceDate(weeklyEvent, "2026-09-18")).toBe(true);
    expect(isCoachingOccurrenceDate(weeklyEvent, "2026-09-17")).toBe(false);
    expect(isCoachingOccurrenceDate(weeklyEvent, "2026-08-14")).toBe(false);
    expect(isCoachingOccurrenceDate(weeklyEvent, "2026-02-31")).toBe(false);
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
