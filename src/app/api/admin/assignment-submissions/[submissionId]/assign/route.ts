import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { assignmentSubmissions } from "@/db/schema";
import {
  getAssignmentReviewer,
  listEligibleReviewers,
} from "@/lib/assignment-review";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

const assignSchema = z.object({
  // null unassigns the submission.
  reviewerId: z.string().uuid().nullable(),
});

/**
 * POST /api/admin/assignment-submissions/[submissionId]/assign
 * Assign or reassign a submission to an eligible reviewer.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const reviewerUser = await getAssignmentReviewer();
  if (!reviewerUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { submissionId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const submission = await db.query.assignmentSubmissions.findFirst({
    where: eq(assignmentSubmissions.id, submissionId),
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.status === "reviewed") {
    return NextResponse.json(
      { error: "This submission has already been reviewed." },
      { status: 409 },
    );
  }
  if (submission.status === "draft") {
    return NextResponse.json(
      { error: "This submission has not been submitted yet." },
      { status: 409 },
    );
  }

  const { reviewerId } = parsed.data;
  if (reviewerId) {
    const eligible = await listEligibleReviewers();
    if (!eligible.some((r) => r.id === reviewerId)) {
      return NextResponse.json(
        { error: "Selected user is not an eligible reviewer." },
        { status: 400 },
      );
    }
  }

  // Keep in_review status if review already started; otherwise reflect
  // assignment state.
  const nextStatus =
    submission.status === "in_review"
      ? "in_review"
      : reviewerId
        ? "assigned"
        : "submitted";

  const [updated] = await db
    .update(assignmentSubmissions)
    .set({ assignedReviewerId: reviewerId, status: nextStatus })
    .where(eq(assignmentSubmissions.id, submissionId))
    .returning();

  return NextResponse.json({ submission: updated });
}
