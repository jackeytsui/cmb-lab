import { describe, expect, it } from "vitest";
import {
  buildCalendarMonth,
  buildCalendarWeek,
  calendarDateInTimeZone,
  calendarDateKey,
  calendarMonthInTimeZone,
  shiftCalendarDate,
  shiftCalendarMonth,
} from "@/lib/group-coaching-calendar";

describe("group coaching calendar", () => {
  it("groups an event by the date in the selected timezone", () => {
    const event = new Date("2026-08-24T02:00:00Z");

    expect(calendarDateKey(event, "America/Toronto")).toBe("2026-08-23");
    expect(calendarDateKey(event, "Asia/Hong_Kong")).toBe("2026-08-24");
  });

  it("finds the current month in the selected timezone", () => {
    const instant = new Date("2026-09-01T01:00:00Z");

    expect(calendarMonthInTimeZone(instant, "America/Toronto")).toEqual({
      year: 2026,
      month: 8,
    });
    expect(calendarMonthInTimeZone(instant, "Asia/Hong_Kong")).toEqual({
      year: 2026,
      month: 9,
    });
  });

  it("builds complete Sunday-to-Saturday calendar weeks", () => {
    const days = buildCalendarMonth(
      { year: 2026, month: 8 },
      "2026-08-23",
    );

    expect(days).toHaveLength(42);
    expect(days[0]).toMatchObject({ key: "2026-07-26", isCurrentMonth: false });
    expect(days.find((day) => day.isToday)?.key).toBe("2026-08-23");
    expect(days.at(-1)).toMatchObject({ key: "2026-09-05", isCurrentMonth: false });
  });

  it("moves across year boundaries", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 12 }, 1)).toEqual({
      year: 2027,
      month: 1,
    });
    expect(shiftCalendarMonth({ year: 2026, month: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
    });
  });

  it("finds and moves calendar dates without changing wall-clock days", () => {
    expect(
      calendarDateInTimeZone(
        new Date("2026-11-01T03:30:00Z"),
        "America/Toronto",
      ),
    ).toEqual({ year: 2026, month: 10, day: 31 });
    expect(shiftCalendarDate({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it("builds a Sunday-to-Saturday week across month boundaries", () => {
    const days = buildCalendarWeek(
      { year: 2026, month: 8, day: 31 },
      "2026-08-31",
    );

    expect(days.map((day) => day.key)).toEqual([
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
    expect(days.find((day) => day.isToday)?.day).toBe(31);
  });
});
