import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions, assignmentSubmissionSentences } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { userCanReviewAssignments } from "@/lib/assignment-review";
import type { ReviewableAssignmentType } from "@/lib/assignment-review";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

// Recordings can be large; the default function timeout can cut the stream off
// mid-transfer. Match the 60s used by the other blob-proxy routes.
export const maxDuration = 60;

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

  if (!isPrivateVercelBlobUrl(sentence.audioUrl)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return proxyBlobMedia(request, sentence.audioUrl, {
    fallbackContentType: "audio/webm",
    label: "course-library/assignment-recordings",
    extraHeaders: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
