import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_SUBMISSIONS_PATH,
  buildAssignmentReviewHref,
  buildAssignmentSubmissionListHref,
  parseAssignmentSubmissionListState,
  sanitizeAssignmentReviewReturnHref,
  type AssignmentSubmissionListState,
} from "@/lib/assignment-review-navigation";

const filteredAssignedView: AssignmentSubmissionListState = {
  tab: "assigned",
  type: "diary",
  status: "in_review",
  reviewerId: "reviewer-123",
  courseId: "course_456",
};

describe("assignment review navigation", () => {
  it("round-trips the exact submissions dashboard filters", () => {
    const href = buildAssignmentSubmissionListHref(filteredAssignedView);
    const url = new URL(href, "https://cmb-lab.local");

    expect(url.pathname).toBe(ASSIGNMENT_SUBMISSIONS_PATH);
    expect(parseAssignmentSubmissionListState(url.searchParams)).toEqual(
      filteredAssignedView,
    );
  });

  it("embeds the filtered dashboard as the review return destination", () => {
    const href = buildAssignmentReviewHref(
      "submission/with unsafe path chars",
      filteredAssignedView,
    );
    const url = new URL(href, "https://cmb-lab.local");

    expect(url.pathname).toBe(
      `${ASSIGNMENT_SUBMISSIONS_PATH}/submission%2Fwith%20unsafe%20path%20chars`,
    );
    expect(
      sanitizeAssignmentReviewReturnHref(url.searchParams.get("returnTo") ?? ""),
    ).toBe(buildAssignmentSubmissionListHref(filteredAssignedView));
  });

  it("defaults direct review links to Assigned to Me", () => {
    expect(sanitizeAssignmentReviewReturnHref(undefined)).toBe(
      `${ASSIGNMENT_SUBMISSIONS_PATH}?tab=assigned`,
    );
  });

  it.each([
    "https://evil.example/admin/content/assignment-submissions?tab=all",
    "//evil.example/admin/content/assignment-submissions?tab=all",
    "/admin/content/users?tab=all",
  ])("rejects unsafe return destinations: %s", (unsafeHref) => {
    expect(sanitizeAssignmentReviewReturnHref(unsafeHref)).toBe(
      `${ASSIGNMENT_SUBMISSIONS_PATH}?tab=assigned`,
    );
  });

  it("drops invalid filters while preserving a valid local destination", () => {
    expect(
      sanitizeAssignmentReviewReturnHref(
        `${ASSIGNMENT_SUBMISSIONS_PATH}?tab=all&type=invalid&status=reviewed&reviewerId=../../admin&courseId=course-1`,
      ),
    ).toBe(
      `${ASSIGNMENT_SUBMISSIONS_PATH}?tab=all&status=reviewed&courseId=course-1`,
    );
  });
});
