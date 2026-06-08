import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { lessonSubmissions, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/assignments/stream-recording?submissionId=...&index=0
 * Authenticated proxy for private Blob recordings (student submissions).
 * Access: the submitting student OR any coach/admin.
 * index: sentence index for vocal_hack (0-based); omit for diary_challenge.
 */
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const submissionId = request.nextUrl.searchParams.get("submissionId");
  const indexParam = request.nextUrl.searchParams.get("index");

  if (!submissionId) {
    return NextResponse.json({ error: "submissionId required" }, { status: 400 });
  }

  // Load the submission
  const submission = await db.query.lessonSubmissions.findFirst({
    where: eq(lessonSubmissions.id, submissionId),
    columns: { userId: true, submissionData: true },
  });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  // Access check: must be the submitting student or a coach
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: { id: true },
    });
    if (!dbUser || dbUser.id !== submission.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Parse submission data to get blob URL
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(submission.submissionData);
  } catch {
    return NextResponse.json({ error: "Invalid submission data" }, { status: 500 });
  }

  let blobUrl: string | null = null;

  if (indexParam !== null) {
    // Vocal hack: recordings[index].blobUrl
    const recordings = data.recordings as Array<{ index: number; blobUrl: string }> | undefined;
    const idx = parseInt(indexParam, 10);
    blobUrl = recordings?.find((r) => r.index === idx)?.blobUrl ?? null;
  } else {
    // Diary challenge: audioBlobUrl
    blobUrl = (data.audioBlobUrl as string) ?? null;
  }

  if (!blobUrl) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobRes = await fetch(blobUrl, { headers });

  if (!blobRes.ok && blobRes.status !== 206) {
    return NextResponse.json({ error: "Failed to stream recording" }, { status: blobRes.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", blobRes.headers.get("content-type") || "audio/webm");
  const cl = blobRes.headers.get("content-length");
  if (cl) responseHeaders.set("Content-Length", cl);
  const cr = blobRes.headers.get("content-range");
  if (cr) responseHeaders.set("Content-Range", cr);
  responseHeaders.set("Accept-Ranges", blobRes.headers.get("accept-ranges") || "bytes");
  responseHeaders.set("Cache-Control", "private, max-age=300");

  return new NextResponse(blobRes.body, { status: blobRes.status, headers: responseHeaders });
}
