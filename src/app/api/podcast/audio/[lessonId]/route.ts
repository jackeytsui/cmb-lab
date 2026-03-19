import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";

/**
 * GET /api/podcast/audio/[lessonId]
 * Public streaming proxy for podcast apps (Spotify, Apple Podcasts, etc.)
 * that cannot authenticate. Supports Range headers for seeking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { lessonId } = await params;

  const lesson = await db.query.lessons.findFirst({
    where: and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)),
    columns: { content: true },
  });

  if (!lesson) {
    return new NextResponse("Not found", { status: 404 });
  }

  let audioUrl = "";
  try {
    const content = JSON.parse(lesson.content ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!audioUrl) {
    return new NextResponse("No audio", { status: 404 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };

  const range = request.headers.get("range");
  if (range) {
    headers["Range"] = range;
  }

  const blobResponse = await fetch(audioUrl, { headers });

  if (!blobResponse.ok && blobResponse.status !== 206) {
    return new NextResponse("Failed to fetch audio", { status: blobResponse.status });
  }

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

  responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=86400");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
