import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessonSubmissions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

const querySchema = z.object({
  submissionId: z.string().uuid(),
  index: z.coerce.number().int().min(0).max(1_000).optional(),
});

/**
 * GET /api/assignments/stream-recording?submissionId=...&index=0
 * Authenticated proxy for private Blob recordings (student submissions).
 * Access: the submitting student OR any coach/admin.
 * index: sentence index for vocal_hack (0-based); omit for diary_challenge.
 */
export async function GET(request: NextRequest) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = querySchema.safeParse({
    submissionId: request.nextUrl.searchParams.get("submissionId") ?? undefined,
    index: request.nextUrl.searchParams.get("index") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid recording request" }, { status: 400 });
  }
  const { submissionId, index } = parsed.data;

  // Load the submission
  const submission = await db.query.lessonSubmissions.findFirst({
    where: eq(lessonSubmissions.id, submissionId),
    columns: { userId: true, submissionData: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Access check: must be the submitting student or a coach
  const isStaff = user.role === "coach" || user.role === "admin";
  if (!isStaff && user.id !== submission.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse submission data to get blob URL
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(submission.submissionData);
  } catch {
    return NextResponse.json({ error: "Invalid submission data" }, { status: 500 });
  }

  let blobUrl: string | null = null;

  if (index !== undefined) {
    // Vocal hack: recordings[index].blobUrl
    const recordings = Array.isArray(data.recordings) ? data.recordings : [];
    const match = recordings.find(
      (recording): recording is { index: number; blobUrl: string } =>
        typeof recording === "object" &&
        recording !== null &&
        (recording as { index?: unknown }).index === index &&
        typeof (recording as { blobUrl?: unknown }).blobUrl === "string",
    );
    blobUrl = match?.blobUrl ?? null;
  } else {
    // Diary challenge: audioBlobUrl
    blobUrl = typeof data.audioBlobUrl === "string" ? data.audioBlobUrl : null;
  }

  if (!blobUrl || !isPrivateVercelBlobUrl(blobUrl)) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  return proxyBlobMedia(request, blobUrl, {
    fallbackContentType: "audio/webm",
    label: "assignments/stream-recording",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
