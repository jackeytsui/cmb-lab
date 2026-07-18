// src/lib/coaching/one-on-one-config.ts
//
// Configuration for the 1:1 coaching timeline shown on each student's 1:1 page
// (coach-only). Everything the CMB team said "may change later" lives here so
// it can be tuned without touching component or compute logic:
//
//   • Which GHL tag marks a student as eligible for the 3 Sheldon sessions
//   • Which program months surface the "book a call with Sheldon" reminder
//   • Which program month surfaces the "book a consultant call" reminder
//   • The booking links the coach follows to schedule each call
//
// Values are read from env when present, otherwise fall back to the documented
// placeholders below. Placeholders are safe: the tag default will simply not
// match real contacts until the real tag is filled in, and the booking links
// point at a "not configured" sentinel the UI handles gracefully.

/** Sentinel returned when a booking link has not been configured yet. */
export const BOOKING_URL_NOT_CONFIGURED = "";

function parseMonthsList(raw: string | undefined, fallback: number[]): number[] {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  return parsed.length > 0 ? parsed : fallback;
}

function parseTagList(raw: string | undefined, fallback: string[]): string[] {
  if (!raw) return fallback;
  const parsed = raw
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return parsed.length > 0 ? parsed : fallback;
}

export interface OneOnOneCoachingConfig {
  /**
   * GHL tag(s) that mark a student as eligible for the 3 one-on-one sessions
   * with Sheldon. Matched case-insensitively against the contact's tags.
   * PLACEHOLDER until the CMB team shares the real tag — set
   * GHL_SHELDON_SESSION_TAG (comma-separated to accept more than one spelling).
   */
  sheldonSessionTags: string[];
  /**
   * Program months (1-based) in which the "help this student book a call with
   * Sheldon" reminder appears. Defaults to months 3, 4 and 5 — one per session.
   * Override with GHL_SHELDON_REMINDER_MONTHS (e.g. "3,4,5").
   */
  sheldonReminderMonths: number[];
  /**
   * Program month (1-based) in which the "book a consultation call with our
   * consultant" reminder appears for ALL coaching students. Defaults to month 5
   * (1 month left in a 6-month program). Override with GHL_CONSULTANT_REMINDER_MONTH.
   */
  consultantReminderMonth: number;
  /**
   * Fallback program length in months, used only when a contact has a start
   * date but no end date in the CRM. Override with GHL_PROGRAM_LENGTH_MONTHS.
   */
  programLengthMonths: number;
  /** Link the coach opens to book the Sheldon session. NEXT_PUBLIC_SHELDON_BOOKING_URL. */
  sheldonBookingUrl: string;
  /** Link the coach opens to book the consultant call. NEXT_PUBLIC_CONSULTANT_BOOKING_URL. */
  consultantBookingUrl: string;
}

/**
 * Resolve the live config from env with documented fallbacks.
 * Kept as a function (not a frozen constant) so tests can exercise different
 * env combinations and so server routes always read current values.
 */
export function getOneOnOneCoachingConfig(): OneOnOneCoachingConfig {
  return {
    sheldonSessionTags: parseTagList(process.env.GHL_SHELDON_SESSION_TAG, [
      // Placeholder — will not match real contacts until replaced.
      "1-on-1-with-sheldon",
    ]),
    sheldonReminderMonths: parseMonthsList(
      process.env.GHL_SHELDON_REMINDER_MONTHS,
      [3, 4, 5]
    ),
    consultantReminderMonth: Number.parseInt(
      process.env.GHL_CONSULTANT_REMINDER_MONTH ?? "5",
      10
    ),
    programLengthMonths: Number.parseInt(
      process.env.GHL_PROGRAM_LENGTH_MONTHS ?? "6",
      10
    ),
    sheldonBookingUrl:
      process.env.NEXT_PUBLIC_SHELDON_BOOKING_URL?.trim() ||
      BOOKING_URL_NOT_CONFIGURED,
    consultantBookingUrl:
      process.env.NEXT_PUBLIC_CONSULTANT_BOOKING_URL?.trim() ||
      BOOKING_URL_NOT_CONFIGURED,
  };
}
