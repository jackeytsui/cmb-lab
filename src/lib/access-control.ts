import "server-only";
import type { Roles } from "@/types/globals";

const DEFAULT_ADMIN_EMAILS = [
  "contact@thecmblueprint.com",
  "jackey.tsui@thecmblueprint.com",
  "janelle.wong@thecmblueprint.com",
];

const DEFAULT_COACH_EMAILS = [
  "jackeytsui.wf@gmail.com",
];

const DEFAULT_STUDENT_EMAILS = [
  "test1@thecmblueprint.com",
  "test2@thecmblueprint.com",
  "test3@thecmblueprint.com",
  "jttohk@gmail.com",
];

function normalizeEmail(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function getAdminEmailSet() {
  const extra = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set(
    [...DEFAULT_ADMIN_EMAILS, ...extra].map((email) => normalizeEmail(email))
  );
}

export function getCoachEmailSet() {
  const extra = (process.env.COACH_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set(
    [...DEFAULT_COACH_EMAILS, ...extra].map((email) => normalizeEmail(email))
  );
}

export function getStudentEmailSet() {
  const extra = (process.env.STUDENT_EMAILS || "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);

  return new Set(
    [...DEFAULT_STUDENT_EMAILS, ...extra].map((email) => normalizeEmail(email))
  );
}

export function isAdminEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getAdminEmailSet().has(normalized);
}

export function isCoachEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getCoachEmailSet().has(normalized);
}

export function isStudentEmail(email?: string | null) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getStudentEmailSet().has(normalized);
}

export function resolveRoleFromEmail(email?: string | null): Roles {
  if (isAdminEmail(email)) return "admin";
  if (isCoachEmail(email)) return "coach";
  if (isStudentEmail(email)) return "student";
  return "student";
}
