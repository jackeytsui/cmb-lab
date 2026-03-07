import { describe, it, expect, vi, afterEach } from "vitest";
import {
  XP_AMOUNTS,
  RING_GOALS,
  DAILY_GOAL_TIERS,
  MAX_LEVEL,
  getXPForLevel,
  getTotalXPForLevel,
  calculateLevel,
  getTodayInTimezone,
  getEffectiveDate,
  areConsecutiveDays,
  type LevelInfo,
} from "@/lib/xp";

// ============================================================
// XP_AMOUNTS constants
// ============================================================

describe("XP_AMOUNTS", () => {
  it("has correct XP values for all sources", () => {
    expect(XP_AMOUNTS.lesson_complete).toBe(50);
    expect(XP_AMOUNTS.practice_exercise_min).toBe(5);
    expect(XP_AMOUNTS.practice_exercise_max).toBe(10);
    expect(XP_AMOUNTS.practice_perfect).toBe(25);
    expect(XP_AMOUNTS.voice_conversation).toBe(15);
    expect(XP_AMOUNTS.daily_goal_met).toBe(10);
  });
});

// ============================================================
// RING_GOALS constants
// ============================================================

describe("RING_GOALS", () => {
  it("has correct daily activity targets", () => {
    expect(RING_GOALS.learn).toBe(1);
    expect(RING_GOALS.practice).toBe(5);
    expect(RING_GOALS.speak).toBe(1);
  });
});

// ============================================================
// DAILY_GOAL_TIERS constants
// ============================================================

describe("DAILY_GOAL_TIERS", () => {
  it("has four tiers matching settings page", () => {
    expect(DAILY_GOAL_TIERS).toHaveLength(4);
    expect(DAILY_GOAL_TIERS).toEqual([
      { label: "Casual", value: 50 },
      { label: "Regular", value: 100 },
      { label: "Serious", value: 150 },
      { label: "Intense", value: 250 },
    ]);
  });
});

// ============================================================
// MAX_LEVEL constant
// ============================================================

describe("MAX_LEVEL", () => {
  it("is 50", () => {
    expect(MAX_LEVEL).toBe(50);
  });
});

// ============================================================
// getXPForLevel
// ============================================================

describe("getXPForLevel", () => {
  it("returns 100 for level 1", () => {
    expect(getXPForLevel(1)).toBe(100);
  });

  it("returns 150 for level 2", () => {
    expect(getXPForLevel(2)).toBe(150);
  });

  it("returns 200 for level 3", () => {
    expect(getXPForLevel(3)).toBe(200);
  });

  it("returns 2550 for level 50", () => {
    expect(getXPForLevel(50)).toBe(2550);
  });

  it("follows linear formula: 100 + (level-1) * 50", () => {
    for (let level = 1; level <= 50; level++) {
      expect(getXPForLevel(level)).toBe(100 + (level - 1) * 50);
    }
  });
});

// ============================================================
// getTotalXPForLevel
// ============================================================

describe("getTotalXPForLevel", () => {
  it("returns 0 for level 1 (start of game)", () => {
    expect(getTotalXPForLevel(1)).toBe(0);
  });

  it("returns 100 for level 2 (need 100 XP to reach level 2)", () => {
    expect(getTotalXPForLevel(2)).toBe(100);
  });

  it("returns 250 for level 3 (100 + 150)", () => {
    expect(getTotalXPForLevel(3)).toBe(250);
  });

  it("returns 450 for level 4 (100 + 150 + 200)", () => {
    expect(getTotalXPForLevel(4)).toBe(450);
  });

  it("is monotonically increasing", () => {
    let prev = getTotalXPForLevel(1);
    for (let level = 2; level <= 50; level++) {
      const current = getTotalXPForLevel(level);
      expect(current).toBeGreaterThan(prev);
      prev = current;
    }
  });

  it("equals cumulative sum of getXPForLevel", () => {
    let cumulative = 0;
    for (let level = 1; level <= 50; level++) {
      expect(getTotalXPForLevel(level)).toBe(cumulative);
      cumulative += getXPForLevel(level);
    }
  });
});

// ============================================================
// calculateLevel
// ============================================================

describe("calculateLevel", () => {
  it("returns level 1 with 0 XP", () => {
    const result = calculateLevel(0);
    expect(result).toEqual({
      level: 1,
      currentLevelXP: 0,
      nextLevelXP: 100,
      totalXP: 0,
    });
  });

  it("returns level 1 with 99 XP (just under threshold)", () => {
    const result = calculateLevel(99);
    expect(result).toEqual({
      level: 1,
      currentLevelXP: 99,
      nextLevelXP: 100,
      totalXP: 99,
    });
  });

  it("returns level 2 with exactly 100 XP", () => {
    const result = calculateLevel(100);
    expect(result).toEqual({
      level: 2,
      currentLevelXP: 0,
      nextLevelXP: 150,
      totalXP: 100,
    });
  });

  it("returns level 2 with 101 XP (1 into level 2)", () => {
    const result = calculateLevel(101);
    expect(result).toEqual({
      level: 2,
      currentLevelXP: 1,
      nextLevelXP: 150,
      totalXP: 101,
    });
  });

  it("returns level 3 with exactly 250 XP (100 + 150)", () => {
    const result = calculateLevel(250);
    expect(result).toEqual({
      level: 3,
      currentLevelXP: 0,
      nextLevelXP: 200,
      totalXP: 250,
    });
  });

  it("caps at level 50 with very high XP", () => {
    const result = calculateLevel(99999);
    expect(result.level).toBe(50);
    expect(result.nextLevelXP).toBe(0);
  });

  it("caps at level 50 with exactly the XP needed for level 50", () => {
    // Total XP to reach level 50
    const xpForLevel50 = getTotalXPForLevel(50);
    const result = calculateLevel(xpForLevel50);
    expect(result.level).toBe(50);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(0);
  });

  it("returns correct currentLevelXP for mid-level values", () => {
    // 175 XP = 100 (level 1 threshold) + 75 into level 2
    const result = calculateLevel(175);
    expect(result.level).toBe(2);
    expect(result.currentLevelXP).toBe(75);
    expect(result.nextLevelXP).toBe(150);
  });

  it("handles negative XP gracefully (treat as 0)", () => {
    const result = calculateLevel(-10);
    expect(result.level).toBe(1);
    expect(result.currentLevelXP).toBe(0);
    expect(result.nextLevelXP).toBe(100);
  });

  it("satisfies LevelInfo type contract", () => {
    const result: LevelInfo = calculateLevel(500);
    expect(typeof result.level).toBe("number");
    expect(typeof result.currentLevelXP).toBe("number");
    expect(typeof result.nextLevelXP).toBe("number");
    expect(typeof result.totalXP).toBe("number");
  });
});

// ============================================================
// getTodayInTimezone
// ============================================================

describe("getTodayInTimezone", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a YYYY-MM-DD format string", () => {
    const result = getTodayInTimezone("UTC");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns correct UTC date for a known time", () => {
    // Set time to 2026-02-07T10:00:00Z
    vi.setSystemTime(new Date("2026-02-07T10:00:00Z"));
    const result = getTodayInTimezone("UTC");
    expect(result).toBe("2026-02-07");
  });

  it("returns next day for Asia/Hong_Kong when UTC is late evening", () => {
    // UTC 2026-02-07T20:00:00 = HK 2026-02-08T04:00:00
    vi.setSystemTime(new Date("2026-02-07T20:00:00Z"));
    const result = getTodayInTimezone("Asia/Hong_Kong");
    expect(result).toBe("2026-02-08");
  });

  it("returns previous day for America/New_York when UTC is early morning", () => {
    // UTC 2026-02-07T03:00:00 = NYC 2026-02-06T22:00:00 (EST is UTC-5)
    vi.setSystemTime(new Date("2026-02-07T03:00:00Z"));
    const result = getTodayInTimezone("America/New_York");
    expect(result).toBe("2026-02-06");
  });
});

// ============================================================
// getEffectiveDate (4-hour grace period)
// ============================================================

describe("getEffectiveDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns today when hour >= 4 in timezone", () => {
    // UTC 10:00 = UTC 10:00 (hour=10, >= 4, so today)
    vi.setSystemTime(new Date("2026-02-07T10:00:00Z"));
    const result = getEffectiveDate("UTC");
    expect(result).toBe("2026-02-07");
  });

  it("returns yesterday when hour < 4 in timezone (grace period)", () => {
    // UTC 02:00 = UTC 02:00 (hour=2, < 4, so yesterday)
    vi.setSystemTime(new Date("2026-02-07T02:00:00Z"));
    const result = getEffectiveDate("UTC");
    expect(result).toBe("2026-02-06");
  });

  it("returns today at exactly hour 4 in timezone", () => {
    // UTC 04:00 = UTC 04:00 (hour=4, >= 4, so today)
    vi.setSystemTime(new Date("2026-02-07T04:00:00Z"));
    const result = getEffectiveDate("UTC");
    expect(result).toBe("2026-02-07");
  });

  it("handles grace period across timezone offset", () => {
    // UTC 2026-02-07T19:00:00 = HK 2026-02-08T03:00:00 (hour 3 < 4, so effective = 2026-02-07)
    vi.setSystemTime(new Date("2026-02-07T19:00:00Z"));
    const result = getEffectiveDate("Asia/Hong_Kong");
    expect(result).toBe("2026-02-07");
  });

  it("does not apply grace at hour 4 in non-UTC timezone", () => {
    // UTC 2026-02-07T20:00:00 = HK 2026-02-08T04:00:00 (hour 4 >= 4, so effective = 2026-02-08)
    vi.setSystemTime(new Date("2026-02-07T20:00:00Z"));
    const result = getEffectiveDate("Asia/Hong_Kong");
    expect(result).toBe("2026-02-08");
  });

  it("returns correct effective date at midnight in timezone", () => {
    // UTC 2026-02-07T00:00:00 = UTC midnight (hour 0 < 4, effective = 2026-02-06)
    vi.setSystemTime(new Date("2026-02-07T00:00:00Z"));
    const result = getEffectiveDate("UTC");
    expect(result).toBe("2026-02-06");
  });
});

// ============================================================
// areConsecutiveDays
// ============================================================

describe("areConsecutiveDays", () => {
  it("returns true for adjacent dates (ascending)", () => {
    expect(areConsecutiveDays("2026-02-06", "2026-02-07")).toBe(true);
  });

  it("returns true for adjacent dates (descending)", () => {
    expect(areConsecutiveDays("2026-02-07", "2026-02-06")).toBe(true);
  });

  it("returns false for same date", () => {
    expect(areConsecutiveDays("2026-02-07", "2026-02-07")).toBe(false);
  });

  it("returns false for dates 2 days apart", () => {
    expect(areConsecutiveDays("2026-02-06", "2026-02-08")).toBe(false);
  });

  it("handles month boundary (Jan 31 -> Feb 1)", () => {
    expect(areConsecutiveDays("2026-01-31", "2026-02-01")).toBe(true);
  });

  it("handles year boundary (Dec 31 -> Jan 1)", () => {
    expect(areConsecutiveDays("2025-12-31", "2026-01-01")).toBe(true);
  });

  it("handles February boundary in leap year", () => {
    // 2028 is a leap year
    expect(areConsecutiveDays("2028-02-28", "2028-02-29")).toBe(true);
    expect(areConsecutiveDays("2028-02-29", "2028-03-01")).toBe(true);
  });

  it("handles February boundary in non-leap year", () => {
    // 2026 is not a leap year
    expect(areConsecutiveDays("2026-02-28", "2026-03-01")).toBe(true);
  });

  it("returns false for dates far apart", () => {
    expect(areConsecutiveDays("2026-01-01", "2026-12-31")).toBe(false);
  });
});
