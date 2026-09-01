export const ASSIGNMENT_SUBMISSIONS_PATH =
  "/admin/content/assignment-submissions";

export type AssignmentSubmissionTab = "all" | "assigned";

export interface AssignmentSubmissionListState {
  tab: AssignmentSubmissionTab;
  type: "" | "text_assignment" | "vocal_hack" | "diary";
  status: "" | "submitted" | "assigned" | "in_review" | "reviewed";
  reviewerId: string;
  courseId: string;
}

export type AssignmentSubmissionSearchParams = Record<
  string,
  string | string[] | undefined
>;

const VALID_TYPES = new Set(["text_assignment", "vocal_hack", "diary"]);
const VALID_STATUSES = new Set([
  "submitted",
  "assigned",
  "in_review",
  "reviewed",
]);
const SAFE_FILTER_ID = /^[a-zA-Z0-9_-]{1,128}$/;

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function readValue(
  source: AssignmentSubmissionSearchParams | URLSearchParams,
  key: string,
): string {
  return source instanceof URLSearchParams
    ? (source.get(key) ?? "")
    : firstValue(source[key]);
}

function safeId(value: string): string {
  const trimmed = value.trim();
  return SAFE_FILTER_ID.test(trimmed) ? trimmed : "";
}

export function parseAssignmentSubmissionListState(
  source: AssignmentSubmissionSearchParams | URLSearchParams,
  defaultTab: AssignmentSubmissionTab = "all",
): AssignmentSubmissionListState {
  const tabValue = readValue(source, "tab");
  const typeValue = readValue(source, "type");
  const statusValue = readValue(source, "status");

  return {
    tab:
      tabValue === "all" || tabValue === "assigned" ? tabValue : defaultTab,
    type: VALID_TYPES.has(typeValue)
      ? (typeValue as AssignmentSubmissionListState["type"])
      : "",
    status: VALID_STATUSES.has(statusValue)
      ? (statusValue as AssignmentSubmissionListState["status"])
      : "",
    reviewerId: safeId(readValue(source, "reviewerId")),
    courseId: safeId(readValue(source, "courseId")),
  };
}

export function buildAssignmentSubmissionListHref(
  state: AssignmentSubmissionListState,
): string {
  const params = new URLSearchParams({ tab: state.tab });
  if (state.type) params.set("type", state.type);
  if (state.status) params.set("status", state.status);
  if (state.reviewerId) params.set("reviewerId", state.reviewerId);
  if (state.courseId) params.set("courseId", state.courseId);
  return `${ASSIGNMENT_SUBMISSIONS_PATH}?${params.toString()}`;
}

export function buildAssignmentReviewHref(
  submissionId: string,
  state: AssignmentSubmissionListState,
): string {
  const returnHref = buildAssignmentSubmissionListHref(state);
  return `${ASSIGNMENT_SUBMISSIONS_PATH}/${encodeURIComponent(submissionId)}?returnTo=${encodeURIComponent(returnHref)}`;
}

const DEFAULT_REVIEW_RETURN_HREF = buildAssignmentSubmissionListHref({
  tab: "assigned",
  type: "",
  status: "",
  reviewerId: "",
  courseId: "",
});

/**
 * Accept only a canonical local submissions-list URL. This prevents an
 * untrusted `returnTo` query value from becoming an open redirect.
 */
export function sanitizeAssignmentReviewReturnHref(
  value: string | string[] | undefined,
): string {
  const candidate = firstValue(value);
  if (!candidate) return DEFAULT_REVIEW_RETURN_HREF;

  try {
    const base = new URL("https://cmb-lab.local");
    const parsed = new URL(candidate, base);
    if (
      parsed.origin !== base.origin ||
      parsed.pathname !== ASSIGNMENT_SUBMISSIONS_PATH
    ) {
      return DEFAULT_REVIEW_RETURN_HREF;
    }

    return buildAssignmentSubmissionListHref(
      parseAssignmentSubmissionListState(parsed.searchParams, "assigned"),
    );
  } catch {
    return DEFAULT_REVIEW_RETURN_HREF;
  }
}
