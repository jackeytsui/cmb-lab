import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions, assignmentSubmissionSentences } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { userCanReviewAssignments } from "@/lib/assignment-review";
import type { ReviewableAssignmentType } from "@/lib/assignment-review";

/**
 * GET /api/course-library/assignment-recordings/[sentenceId]
 *
 * Authenticated proxy that streams a submitted sentence recording (e.g. a
 * Vocal Hack take) from private Vercel Blob. Range headers are forwarded so
 * reviewers can drag the playhead for re-listening.
 *
 * Access: the submitting student, admins, or holders of the review capability
 * for the submission's assignment type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sentenceId: string }> },
) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sentenceId } = await params;

  const sentence = await db.query.assignmentSubmissionSentences.findFirst({
    where: eq(assignmentSubmissionSentences.id, sentenceId),
    columns: { submissionId: true, audioUrl: true },
  });
  if (!sentence?.audioUrl) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const submission = await db.query.assignmentSubmissions.findFirst({
    where: eq(assignmentSubmissions.id, sentence.submissionId),
    columns: { studentId: true, assignmentType: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const isOwner = submission.studentId === user.id;
  const isReviewer =
    !isOwner &&
    (await userCanReviewAssignments(
      user,
      submission.assignmentType as ReviewableAssignmentType,
    ));
  if (!isOwner && !isReviewer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobResponse = await fetch(sentence.audioUrl, { headers });
  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch recording" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResponse.headers.get("content-type") ?? "audio/webm",
  );
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set(
    "Accept-Ranges",
    blobResponse.headers.get("accept-ranges") ?? "bytes",
  );
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("Content-Disposition", "inline");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
