import { NextResponse } from "next/server";
import {
  getAnyAssignmentReviewer,
  listEligibleReviewers,
} from "@/lib/assignment-review";

/**
 * GET /api/admin/assignment-submissions/reviewers
 * Users eligible to be assigned as assignment reviewers
 * (admins + Challenge Reviewer capability holders).
 */
export async function GET() {
  const reviewerUser = await getAnyAssignmentReviewer();
  if (!reviewerUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const reviewers = await listEligibleReviewers();
  return NextResponse.json({ reviewers });
}
