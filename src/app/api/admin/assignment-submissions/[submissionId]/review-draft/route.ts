import { NextRequest, NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  assignmentSubmissions,
  assignmentSubmissionSentences,
} from "@/db/schema";
import {
  getAnyAssignmentReviewer,
  userCanReviewAssignments,
  type ReviewableAssignmentType,
} from "@/lib/assignment-review";
import { parseAssignmentReviewDraft } from "@/lib/assignment-review-draft";

interface RouteParams {
  params: Promise<{ submissionId: string }>;
}

/**
 * POST /api/admin/assignment-submissions/[submissionId]/review-draft
 *
 * Saves private reviewer work without completing the review, changing its
 * dashboard status, or exposing partial feedback to the student.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const [reviewer, { submissionId }] = await Promise.all([
    getAnyAssignmentReviewer(),
    params,
  ]);
  if (!reviewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const submission = await db.query.assignmentSubmissions.findFirst({
    where: eq(assignmentSubmissions.id, submissionId),
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (
    !(await userCanReviewAssignments(
      reviewer,
      submission.assignmentType as ReviewableAssignmentType,
    ))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (submission.status === "draft") {
    return NextResponse.json(
      { error: "This submission has not been submitted yet." },
      { status: 409 },
    );
  }

  const sentences = await db.query.assignmentSubmissionSentences.findMany({
    where: eq(assignmentSubmissionSentences.submissionId, submissionId),
    columns: { id: true },
    orderBy: [asc(assignmentSubmissionSentences.sortOrder)],
  });
  const draft = parseAssignmentReviewDraft(
    body,
    submission.assignmentType,
    sentences.map((sentence) => sentence.id),
  );
  if (!draft) {
    return NextResponse.json(
      { error: "Draft validation failed" },
      { status: 400 },
    );
  }

  const savedAt = new Date();
  await db
    .update(assignmentSubmissions)
    .set({
      reviewDraft: draft,
      reviewDraftSavedAt: savedAt,
      reviewDraftReviewerId: reviewer.id,
    })
    .where(eq(assignmentSubmissions.id, submissionId));

  return NextResponse.json({ savedAt: savedAt.toISOString() });
}
