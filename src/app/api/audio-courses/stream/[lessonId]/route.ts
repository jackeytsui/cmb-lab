import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";

/**
 * GET /api/audio-courses/stream/[lessonId]
 * Authenticated proxy for private Vercel Blob audio files.
 * Supports Range headers for seeking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { content: true },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let audioUrl = "";
  try {
    const content = JSON.parse(lesson.content ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!audioUrl) {
    return NextResponse.json({ error: "No audio for this lesson" }, { status: 404 });
  }

  // Fetch from Vercel Blob with the token
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };

  // Forward Range header for seeking support
  const range = request.headers.get("range");
  if (range) {
    headers["Range"] = range;
  }

  const blobResponse = await fetch(audioUrl, { headers });

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch audio" },
      { status: blobResponse.status },
    );
  }

  // Stream the response back with proper headers
  const responseHeaders = new Headers();
  const contentType = blobResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);

  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);

  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);

  const acceptRanges = blobResponse.headers.get("accept-ranges");
  if (acceptRanges) responseHeaders.set("Accept-Ranges", acceptRanges);
  else responseHeaders.set("Accept-Ranges", "bytes");

  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
