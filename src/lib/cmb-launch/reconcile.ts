import {
  desiredAccountState,
  isValidEmail,
  normalizeEmail,
  parseDateOnly,
  parseProduct,
  parseYesNo,
  type AccountStatus,
} from "./domain";

export type ReconciliationClassification =
  | "existing_correct"
  | "existing_reactivate"
  | "existing_status_change"
  | "new_ready"
  | "duplicate_email_review"
  | "missing_or_invalid_email"
  | "unknown_product"
  | "invalid_eligibility"
  | "invalid_dates"
  | "manual_review";

export interface SourceStudent {
  rowNumber: number;
  ghlContactId: string;
  email: string;
  product: string;
  courseEligibility: string;
  oneOnOneEligibility: string;
  productStartDate: string;
  productEndDate: string;
}

export interface ExistingUserSnapshot {
  id: string;
  email: string;
  accountStatus: AccountStatus;
  product: string | null;
  courseIds: string[];
  customCourseIds: string[];
}

export interface ReconciliationRow {
  rowNumber: number;
  ghlContactId: string;
  normalizedEmail: string | null;
  cmbLabUserId: string | null;
  matchMethod: "normalized_email" | "none";
  classification: ReconciliationClassification;
  currentStatus: AccountStatus | null;
  desiredStatus: AccountStatus | null;
  currentProduct: string | null;
  desiredProduct: string | null;
  currentCourseIds: string[];
  customCourseIdsPreserved: string[];
  proposedCourseChanges: string[];
  reason: string;
  humanApprovalRequired: boolean;
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  counts: Record<string, number>;
  blockingErrors: string[];
}

export function reconcileStudents(params: {
  students: SourceStudent[];
  existingUsers: ExistingUserSnapshot[];
  asOfDate: string;
  expirationRuleApproved?: boolean;
}): ReconciliationResult {
  const userByEmail = new Map<string, ExistingUserSnapshot>();
  for (const user of params.existingUsers) userByEmail.set(normalizeEmail(user.email), user);

  const sourceCounts = new Map<string, number>();
  for (const student of params.students) {
    const email = normalizeEmail(student.email);
    if (email) sourceCounts.set(email, (sourceCounts.get(email) ?? 0) + 1);
  }

  const rows = params.students.map((student): ReconciliationRow => {
    const email = normalizeEmail(student.email);
    const existing = email ? userByEmail.get(email) ?? null : null;
    const base = {
      rowNumber: student.rowNumber,
      ghlContactId: student.ghlContactId,
      normalizedEmail: email || null,
      cmbLabUserId: existing?.id ?? null,
      matchMethod: existing ? ("normalized_email" as const) : ("none" as const),
      currentStatus: existing?.accountStatus ?? null,
      currentProduct: existing?.product ?? null,
      currentCourseIds: existing?.courseIds ?? [],
      customCourseIdsPreserved: existing?.customCourseIds ?? [],
      proposedCourseChanges: [] as string[],
    };
    const fail = (classification: ReconciliationClassification, reason: string): ReconciliationRow => ({
      ...base, classification, desiredStatus: null, desiredProduct: null, reason,
      humanApprovalRequired: true,
    });

    if (!email || !isValidEmail(email)) return fail("missing_or_invalid_email", "invalid_email");
    if ((sourceCounts.get(email) ?? 0) > 1) return fail("duplicate_email_review", "duplicate_normalized_email");
    const product = parseProduct(student.product);
    if (!product.ok) return fail("unknown_product", `${product.reason}:${product.raw}`);
    const eligibility = parseYesNo(student.courseEligibility);
    const oneOnOne = parseYesNo(student.oneOnOneEligibility);
    if (!eligibility.ok || !oneOnOne.ok) return fail("invalid_eligibility", "invalid_eligibility_value");
    const start = parseDateOnly(student.productStartDate);
    const end = parseDateOnly(student.productEndDate);
    if (!start.ok || !end.ok) return fail("invalid_dates", "invalid_product_date");
    const desired = desiredAccountState({
      courseEligibility: eligibility.value,
      endDate: end.value,
      asOfDate: params.asOfDate,
      expirationRuleApproved: params.expirationRuleApproved ?? false,
    });
    if (desired.reviewRequired) return fail("manual_review", desired.reason);

    let classification: ReconciliationClassification;
    if (!existing) classification = "new_ready";
    else if (existing.accountStatus !== "active" && desired.status === "active") classification = "existing_reactivate";
    else if (existing.accountStatus !== desired.status) classification = "existing_status_change";
    else classification = "existing_correct";

    return {
      ...base,
      classification,
      desiredStatus: desired.status,
      desiredProduct: product.value,
      reason: desired.reason,
      // Product-course rules are intentionally absent until the course matrix is approved.
      humanApprovalRequired: false,
    };
  });

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
  const blockingErrors = rows
    .filter((row) => row.humanApprovalRequired)
    .map((row) => `row:${row.rowNumber}:${row.reason}`);
  return { rows, counts, blockingErrors };
}
