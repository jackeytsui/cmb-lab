export type YesNo = "yes" | "no";
export type Product = "CMBP" | "Improve Kanto";

export type ParsedValue<T> =
  | { ok: true; value: T }
  | { ok: false; raw: string; reason: string };

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function parseYesNo(value: unknown): ParsedValue<YesNo> {
  const raw = String(value ?? "").trim();
  const normalized = raw.toLowerCase();
  if (normalized === "yes") return { ok: true, value: "yes" };
  if (normalized === "no") return { ok: true, value: "no" };
  return { ok: false, raw, reason: raw ? "unknown_yes_no_value" : "missing_yes_no_value" };
}

export function parseProduct(value: unknown): ParsedValue<Product> {
  const raw = String(value ?? "").trim();
  if (raw.toLowerCase() === "cmbp") return { ok: true, value: "CMBP" };
  if (raw.toLowerCase() === "improve kanto") {
    return { ok: true, value: "Improve Kanto" };
  }
  // In particular, do not silently convert the historical CSV value
  // "Improve Canto" into the approved system value "Improve Kanto".
  return { ok: false, raw, reason: raw ? "unknown_product" : "missing_product" };
}

export function parseDateOnly(value: unknown): ParsedValue<string | null> {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, raw, reason: "invalid_date_format" };
  }
  const [year, month, day] = raw.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, raw, reason: "invalid_calendar_date" };
  }
  return { ok: true, value: raw };
}

export type AccountStatus = "active" | "paused" | "expired";

export interface DesiredAccountStateInput {
  courseEligibility: YesNo;
  endDate: string | null;
  asOfDate: string;
  expirationRuleApproved: boolean;
}

export type DesiredAccountState =
  | { status: AccountStatus; reviewRequired: false; reason: string }
  | { status: null; reviewRequired: true; reason: string };

export function desiredAccountState(input: DesiredAccountStateInput): DesiredAccountState {
  if (input.courseEligibility === "no") {
    return { status: "paused", reviewRequired: false, reason: "course_ineligible" };
  }
  if (!input.endDate) {
    return { status: "active", reviewRequired: false, reason: "eligible_no_end_date" };
  }
  if (!input.expirationRuleApproved) {
    return { status: null, reviewRequired: true, reason: "expiration_boundary_unapproved" };
  }
  return input.endDate < input.asOfDate
    ? { status: "expired", reviewRequired: false, reason: "product_end_date_passed" }
    : { status: "active", reviewRequired: false, reason: "eligible_within_product_dates" };
}
