// src/lib/coaching/timeline.ts
//
// Pure compute for the 1:1 coaching timeline. No IO, no framework — given a
// student's program start/end dates and GHL tags, it works out:
//
//   • how much time is left ("X months, Y days left")
//   • which program month the student is currently in (1-based)
//   • whether the student is tagged for the 3 Sheldon sessions
//   • which coach reminders should surface right now
//
// The API route feeds it CRM data; the component renders what it returns.
// Everything here is deterministic given `now`, so it is fully unit-tested.

import {
  differenceInCalendarDays,
  differenceInCalendarMonths,
  addMonths,
  isValid,
  parse,
} from "date-fns";
import type { OneOnOneCoachingConfig } from "./one-on-one-config";

/** GHL exports dates like "Feb 06 2026". We also tolerate ISO / RFC strings. */
const GHL_DATE_FORMATS = ["MMM dd yyyy", "MMM d yyyy", "MMMM dd yyyy", "MMMM d yyyy"];

/**
 * Parse a date value coming from GHL. Handles the "Feb 06 2026" export format,
 * epoch millisecond numbers, and ISO strings. Returns null when unparseable so
 * callers can degrade gracefully rather than render "Invalid Date".
 */
export function parseGhlDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;

  if (value instanceof Date) {
    return isValid(value) ? value : null;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Try the GHL display formats first (most common in this codebase).
  for (const fmt of GHL_DATE_FORMATS) {
    const parsed = parse(raw, fmt, new Date());
    if (isValid(parsed)) return parsed;
  }

  // Fall back to native parsing for ISO / RFC-style strings.
  const native = new Date(raw);
  return isValid(native) ? native : null;
}

export type CoachReminderType = "sheldon" | "consultant";

export interface CoachReminder {
  type: CoachReminderType;
  /** Short headline shown in the reminder banner. */
  title: string;
  /** One-line explanation of why this reminder is showing now. */
  detail: string;
  /** Label for the call-to-action link. */
  ctaLabel: string;
  /** Booking URL; empty string when the link has not been configured yet. */
  bookingUrl: string;
}

export interface CoachingTimeline {
  /** True when both a valid start and end window could be established. */
  hasWindow: boolean;
  startDate: Date | null;
  endDate: Date | null;
  /** Whole months remaining until the end date (never negative). */
  monthsLeft: number;
  /** Additional whole days after `monthsLeft` (never negative). */
  daysLeft: number;
  /** Total calendar days remaining (negative if already ended). */
  totalDaysLeft: number;
  /** 1-based program month the student is currently in (>=1). */
  currentMonth: number;
  /** Total program length in months (from the window, else config fallback). */
  totalMonths: number;
  /** Fraction elapsed 0..1, for a progress bar. */
  progress: number;
  /** Program has finished (end date is in the past). */
  isEnded: boolean;
  /** Program has not started yet (start date is in the future). */
  isNotStarted: boolean;
  /** Whether the contact carries a Sheldon-session tag. */
  hasSheldonTag: boolean;
  /** Reminders that should surface for the coach right now. */
  reminders: CoachReminder[];
}

/** Case-insensitive check that the contact carries at least one Sheldon tag. */
export function hasSheldonSessionTag(
  tags: string[],
  config: OneOnOneCoachingConfig
): boolean {
  if (!tags.length || !config.sheldonSessionTags.length) return false;
  const normalized = new Set(tags.map((t) => t.trim().toLowerCase()));
  return config.sheldonSessionTags.some((tag) => normalized.has(tag));
}

export interface ComputeTimelineArgs {
  start: unknown;
  end: unknown;
  tags: string[];
  config: OneOnOneCoachingConfig;
  /** Injectable clock for testing; defaults to now. */
  now?: Date;
}

/**
 * Compute the full coaching timeline for one student.
 *
 * The program window is [start, end]. When only a start date exists, the end is
 * derived by adding `config.programLengthMonths`. When no start date exists we
 * still return a result (hasWindow=false) so the UI can show a friendly empty
 * state instead of breaking.
 */
export function computeCoachingTimeline({
  start,
  end,
  tags,
  config,
  now = new Date(),
}: ComputeTimelineArgs): CoachingTimeline {
  const startDate = parseGhlDate(start);
  let endDate = parseGhlDate(end);

  // Derive an end date from the start when the CRM only has a start.
  if (!endDate && startDate) {
    endDate = addMonths(startDate, config.programLengthMonths);
  }

  const hasSheldonTag = hasSheldonSessionTag(tags, config);

  if (!startDate || !endDate) {
    return {
      hasWindow: false,
      startDate: startDate ?? null,
      endDate: endDate ?? null,
      monthsLeft: 0,
      daysLeft: 0,
      totalDaysLeft: 0,
      currentMonth: 0,
      totalMonths: config.programLengthMonths,
      progress: 0,
      isEnded: false,
      isNotStarted: false,
      hasSheldonTag,
      reminders: [],
    };
  }

  const totalDaysLeft = differenceInCalendarDays(endDate, now);
  const isEnded = totalDaysLeft < 0;
  const isNotStarted = differenceInCalendarDays(startDate, now) > 0;

  // Break remaining time into whole months + leftover days.
  let monthsLeft = Math.max(0, differenceInCalendarMonths(endDate, now));
  // differenceInCalendarMonths counts month boundaries, which can overshoot the
  // real remaining span by a few days — step back until the anchor fits.
  while (monthsLeft > 0 && differenceInCalendarDays(endDate, addMonths(now, monthsLeft)) < 0) {
    monthsLeft -= 1;
  }
  const daysLeft = isEnded
    ? 0
    : Math.max(0, differenceInCalendarDays(endDate, addMonths(now, monthsLeft)));

  const totalMonths = Math.max(
    1,
    differenceInCalendarMonths(endDate, startDate) || config.programLengthMonths
  );

  // 1-based program month: month 1 covers the first month after start.
  const monthsElapsed = differenceInCalendarMonths(now, startDate);
  const currentMonth = isNotStarted
    ? 0
    : Math.min(totalMonths, Math.max(1, monthsElapsed + 1));

  const totalSpanDays = Math.max(1, differenceInCalendarDays(endDate, startDate));
  const elapsedDays = differenceInCalendarDays(now, startDate);
  const progress = Math.min(1, Math.max(0, elapsedDays / totalSpanDays));

  const reminders = buildReminders({
    currentMonth,
    isActive: !isEnded && !isNotStarted,
    hasSheldonTag,
    config,
  });

  return {
    hasWindow: true,
    startDate,
    endDate,
    monthsLeft,
    daysLeft,
    totalDaysLeft,
    currentMonth,
    totalMonths,
    progress,
    isEnded,
    isNotStarted,
    hasSheldonTag,
    reminders,
  };
}

function buildReminders({
  currentMonth,
  isActive,
  hasSheldonTag,
  config,
}: {
  currentMonth: number;
  isActive: boolean;
  hasSheldonTag: boolean;
  config: OneOnOneCoachingConfig;
}): CoachReminder[] {
  if (!isActive) return [];
  const reminders: CoachReminder[] = [];

  // A reminder only surfaces once its booking link is configured — this is what
  // lets the two calls launch independently (Sheldon now, consultant later):
  // an unconfigured call stays dark instead of nagging coaches with a dead link.

  // Sheldon session reminder — tag-gated, only in the configured cadence months.
  if (
    hasSheldonTag &&
    config.sheldonBookingUrl.length > 0 &&
    config.sheldonReminderMonths.includes(currentMonth)
  ) {
    const sessionNumber = config.sheldonReminderMonths.indexOf(currentMonth) + 1;
    reminders.push({
      type: "sheldon",
      title: `Book this student's 1:1 with Sheldon`,
      detail: `Month ${currentMonth} — session ${sessionNumber} of ${config.sheldonReminderMonths.length}. Help your student schedule their call with Sheldon.`,
      ctaLabel: "Book Sheldon session",
      bookingUrl: config.sheldonBookingUrl,
    });
  }

  // Consultant reminder — all coaching students, at the configured month.
  // Stays hidden until the consultant booking link is set (launched separately).
  if (
    config.consultantBookingUrl.length > 0 &&
    currentMonth === config.consultantReminderMonth
  ) {
    reminders.push({
      type: "consultant",
      title: `Book a consultation call`,
      detail: `1 month left — help your student book a consultation call with our consultant.`,
      ctaLabel: "Book consultant call",
      bookingUrl: config.consultantBookingUrl,
    });
  }

  return reminders;
}
