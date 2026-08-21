import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assignmentSubmissions } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { userCanReviewAssignments } from "@/lib/assignment-review";
import type { ReviewableAssignmentType } from "@/lib/assignment-review";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

// Recordings (video/audio) can be large; the default function timeout can cut
// the stream off mid-transfer. Match the 60s used by the other blob-proxy
// routes in this codebase.
export const maxDuration = 60;

/**
 * GET /api/course-library/submission-recording/[submissionId]
 *
 * Streams a submission-level student recording (e.g. a Diary read) from private
 * Vercel Blob. Forwards Range headers so reviewers can drag the playhead.
 * Access: the submitting student, admins, or holders of the review capability
 * for the submission's assignment type.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ submissionId: string }> },
) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { submissionId } = await params;

  const submission = await db.query.assignmentSubmissions.findFirst({
    where: eq(assignmentSubmissions.id, submissionId),
    columns: { studentId: true, assignmentType: true, studentAudioUrl: true },
  });
  if (!submission?.studentAudioUrl) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
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

  if (!isPrivateVercelBlobUrl(submission.studentAudioUrl)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return proxyBlobMedia(request, submission.studentAudioUrl, {
    fallbackContentType: "audio/webm",
    label: "course-library/submission-recording",
    extraHeaders: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
