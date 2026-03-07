// XP Calculation & Date Utilities — Pure Functions (no DB calls)
//
// This module contains the mathematical core of the XP system:
// - XP reward constants for each activity type
// - Level progression formula (linear: 100 + (level-1) * 50)
// - Timezone-aware date utilities for streak detection

import { TZDate } from "@date-fns/tz";
import { format, differenceInCalendarDays, subDays } from "date-fns";

// ============================================================
// Types
// ============================================================

export interface LevelInfo {
  level: number;
  currentLevelXP: number; // XP earned within current level
  nextLevelXP: number; // XP needed for next level (0 if at max)
  totalXP: number;
}

// ============================================================
// Constants
// ============================================================

/** Maximum achievable level */
export const MAX_LEVEL = 50;

/** XP awarded for each activity type */
export const XP_AMOUNTS = {
  lesson_complete: 50,
  practice_exercise_min: 5,
  practice_exercise_max: 10,
  practice_perfect: 25,
  voice_conversation: 15,
  daily_goal_met: 10,
} as const;

/** Daily activity ring targets (count-based, not XP) */
export const RING_GOALS = {
  learn: 1, // lessons per day
  practice: 5, // exercises per day
  speak: 1, // conversations per day
} as const;

/** Daily XP goal tiers matching the settings page */
export const DAILY_GOAL_TIERS = [
  { label: "Casual", value: 50 },
  { label: "Regular", value: 100 },
  { label: "Serious", value: 150 },
  { label: "Intense", value: 250 },
] as const;

// ============================================================
// Level Progression Functions
// ============================================================

/**
 * XP needed to advance FROM a given level to the next level.
 * Formula: 100 + (level - 1) * 50
 *
 * Level 1 -> 2: 100 XP
 * Level 2 -> 3: 150 XP
 * Level 50 -> (cap): 2550 XP
 */
export function getXPForLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

/**
 * Total cumulative XP needed to REACH a given level.
 * Sum of arithmetic series: sum(i=1..level-1) of getXPForLevel(i)
 *
 * Level 1: 0 (starting point)
 * Level 2: 100
 * Level 3: 250 (100 + 150)
 */
export function getTotalXPForLevel(level: number): number {
  if (level <= 1) return 0;
  // Arithmetic series: n terms, first = 100, last = 100 + (level-2)*50
  const n = level - 1;
  const first = 100;
  const last = 100 + (level - 2) * 50;
  return (n * (first + last)) / 2;
}

/**
 * Calculate level info from total XP.
 * Walks through levels, subtracting each threshold until XP is insufficient.
 * Clamps at MAX_LEVEL (50).
 */
export function calculateLevel(totalXP: number): LevelInfo {
  // Handle negative XP gracefully
  const safeXP = Math.max(0, totalXP);

  let level = 1;
  let xpRemaining = safeXP;

  while (level < MAX_LEVEL) {
    const needed = getXPForLevel(level);
    if (xpRemaining < needed) break;
    xpRemaining -= needed;
    level++;
  }

  return {
    level: Math.min(level, MAX_LEVEL),
    currentLevelXP: level >= MAX_LEVEL ? 0 : xpRemaining,
    nextLevelXP: level >= MAX_LEVEL ? 0 : getXPForLevel(level),
    totalXP: safeXP,
  };
}

// ============================================================
// Timezone Date Utilities
// ============================================================

/**
 * Get today's date string (YYYY-MM-DD) in the user's timezone.
 * Uses IANA timezone string (e.g., "Asia/Hong_Kong", "America/New_York").
 */
export function getTodayInTimezone(timezone: string): string {
  const now = TZDate.tz(timezone);
  return format(now, "yyyy-MM-dd");
}

/**
 * Get the "effective date" for streak purposes with a 4-hour grace period.
 * If the current hour in the user's timezone is before 4 AM,
 * the effective date is yesterday (activity after midnight counts for previous day).
 */
export function getEffectiveDate(timezone: string): string {
  const now = TZDate.tz(timezone);
  const hour = now.getHours();

  if (hour < 4) {
    // Grace period: count as yesterday
    const yesterday = subDays(now, 1);
    return format(yesterday, "yyyy-MM-dd");
  }

  return format(now, "yyyy-MM-dd");
}

/**
 * Check if two date strings represent consecutive calendar days.
 * Order does not matter (checks absolute difference = 1).
 */
export function areConsecutiveDays(dateA: string, dateB: string): boolean {
  const a = new Date(dateA + "T00:00:00");
  const b = new Date(dateB + "T00:00:00");
  return Math.abs(differenceInCalendarDays(b, a)) === 1;
}
