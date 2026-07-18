import { describe, it, expect } from "vitest";
import {
  computeCoachingTimeline,
  parseGhlDate,
  hasSheldonSessionTag,
} from "@/lib/coaching/timeline";
import type { OneOnOneCoachingConfig } from "@/lib/coaching/one-on-one-config";

const config: OneOnOneCoachingConfig = {
  sheldonSessionTags: ["1-on-1-with-sheldon"],
  sheldonReminderMonths: [3, 4, 5],
  consultantReminderMonth: 5,
  programLengthMonths: 6,
  sheldonBookingUrl: "https://book.example/sheldon",
  consultantBookingUrl: "https://book.example/consultant",
};

describe("parseGhlDate", () => {
  it("parses GHL export format 'Feb 06 2026'", () => {
    const d = parseGhlDate("Feb 06 2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(1); // February
    expect(d!.getDate()).toBe(6);
  });

  it("parses single-digit day 'Feb 6 2026'", () => {
    expect(parseGhlDate("Feb 6 2026")).not.toBeNull();
  });

  it("parses ISO strings and epoch numbers", () => {
    expect(parseGhlDate("2026-02-06")).not.toBeNull();
    expect(parseGhlDate(Date.UTC(2026, 1, 6))).not.toBeNull();
  });

  it("returns null for empty / garbage input", () => {
    expect(parseGhlDate(null)).toBeNull();
    expect(parseGhlDate("")).toBeNull();
    expect(parseGhlDate("not a date")).toBeNull();
  });
});

describe("hasSheldonSessionTag", () => {
  it("matches case-insensitively", () => {
    expect(hasSheldonSessionTag(["1-On-1-With-Sheldon"], config)).toBe(true);
  });
  it("returns false when tag absent", () => {
    expect(hasSheldonSessionTag(["youtube-lead", "first-login"], config)).toBe(false);
  });
  it("returns false for empty tag list", () => {
    expect(hasSheldonSessionTag([], config)).toBe(false);
  });
});

describe("computeCoachingTimeline", () => {
  const start = "Feb 06 2026";
  const end = "Aug 06 2026"; // 6-month program

  it("computes months + days left mid-program", () => {
    const t = computeCoachingTimeline({
      start,
      end,
      tags: [],
      config,
      now: new Date(2026, 3, 20), // Apr 20 2026
    });
    expect(t.hasWindow).toBe(true);
    expect(t.monthsLeft).toBe(3);
    expect(t.daysLeft).toBeGreaterThanOrEqual(16);
    expect(t.daysLeft).toBeLessThanOrEqual(17);
    expect(t.totalMonths).toBe(6);
  });

  it("reports the current 1-based program month", () => {
    // Started Feb 6; on Apr 20 the student is in program month 3.
    const t = computeCoachingTimeline({
      start,
      end,
      tags: [],
      config,
      now: new Date(2026, 3, 20),
    });
    expect(t.currentMonth).toBe(3);
  });

  it("does NOT show the Sheldon reminder without the tag", () => {
    const t = computeCoachingTimeline({
      start,
      end,
      tags: ["youtube-lead"],
      config,
      now: new Date(2026, 3, 20), // month 3
    });
    expect(t.reminders.find((r) => r.type === "sheldon")).toBeUndefined();
  });

  it("shows the Sheldon reminder in months 3/4/5 for tagged students", () => {
    for (const [now, month] of [
      [new Date(2026, 3, 20), 3], // Apr → month 3
      [new Date(2026, 4, 20), 4], // May → month 4
      [new Date(2026, 5, 20), 5], // Jun → month 5
    ] as const) {
      const t = computeCoachingTimeline({
        start,
        end,
        tags: ["1-on-1-with-sheldon"],
        config,
        now,
      });
      expect(t.currentMonth).toBe(month);
      const sheldon = t.reminders.find((r) => r.type === "sheldon");
      expect(sheldon, `month ${month}`).toBeDefined();
      expect(sheldon!.bookingUrl).toBe("https://book.example/sheldon");
    }
  });

  it("does NOT show the Sheldon reminder in months 1/2/6", () => {
    for (const now of [
      new Date(2026, 1, 20), // Feb → month 1
      new Date(2026, 2, 20), // Mar → month 2
    ]) {
      const t = computeCoachingTimeline({
        start,
        end,
        tags: ["1-on-1-with-sheldon"],
        config,
        now,
      });
      expect(t.reminders.find((r) => r.type === "sheldon")).toBeUndefined();
    }
  });

  it("shows the consultant reminder at month 5 for ALL coaching students", () => {
    const untagged = computeCoachingTimeline({
      start,
      end,
      tags: ["youtube-lead"],
      config,
      now: new Date(2026, 5, 20), // month 5
    });
    const consultant = untagged.reminders.find((r) => r.type === "consultant");
    expect(consultant).toBeDefined();
    expect(consultant!.bookingUrl).toBe("https://book.example/consultant");
  });

  it("does not show the consultant reminder before month 5", () => {
    const t = computeCoachingTimeline({
      start,
      end,
      tags: [],
      config,
      now: new Date(2026, 4, 20), // month 4
    });
    expect(t.reminders.find((r) => r.type === "consultant")).toBeUndefined();
  });

  it("suppresses all reminders once the program has ended", () => {
    const t = computeCoachingTimeline({
      start,
      end,
      tags: ["1-on-1-with-sheldon"],
      config,
      now: new Date(2026, 8, 20), // Sep — after Aug 06 end
    });
    expect(t.isEnded).toBe(true);
    expect(t.reminders).toHaveLength(0);
    expect(t.monthsLeft).toBe(0);
    expect(t.daysLeft).toBe(0);
  });

  it("derives an end date from the start when the CRM has no end date", () => {
    const t = computeCoachingTimeline({
      start,
      end: null,
      tags: [],
      config,
      now: new Date(2026, 3, 20),
    });
    expect(t.hasWindow).toBe(true);
    expect(t.endDate).not.toBeNull();
    expect(t.endDate!.getMonth()).toBe(7); // Aug (Feb + 6 months)
  });

  it("returns an empty window when there is no start date", () => {
    const t = computeCoachingTimeline({
      start: null,
      end: null,
      tags: ["1-on-1-with-sheldon"],
      config,
      now: new Date(2026, 3, 20),
    });
    expect(t.hasWindow).toBe(false);
    expect(t.reminders).toEqual([]);
    // Tag detection still works even without a window.
    expect(t.hasSheldonTag).toBe(true);
  });

  it("flags not-started programs and shows no reminders", () => {
    const t = computeCoachingTimeline({
      start: "Feb 06 2026",
      end: "Aug 06 2026",
      tags: ["1-on-1-with-sheldon"],
      config,
      now: new Date(2026, 0, 20), // Jan — before start
    });
    expect(t.isNotStarted).toBe(true);
    expect(t.currentMonth).toBe(0);
    expect(t.reminders).toEqual([]);
  });
});
