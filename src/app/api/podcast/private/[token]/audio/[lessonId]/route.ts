import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { lessons, podcastTokens } from "@/db/schema";

/**
 * GET /api/podcast/private/[token]/audio/[lessonId]
 * Stream audio for a private podcast feed, authenticated by token.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; lessonId: string }> },
) {
  const { token, lessonId } = await params;

  // Validate token
  const tokenRow = await db.query.podcastTokens.findFirst({
    where: eq(podcastTokens.token, token),
  });

  if (!tokenRow) {
    return new NextResponse("Unauthorized", { status: 403 });
  }

  // Get the lesson
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(and(eq(lessons.id, lessonId), isNull(lessons.deletedAt)));

  if (!lesson) {
    return new NextResponse("Lesson not found", { status: 404 });
  }

  // Parse audio URL from lesson content JSON
  let audioUrl = "";
  try {
    const content = JSON.parse(lesson.content ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!audioUrl) {
    return new NextResponse("No audio available", { status: 404 });
  }

  // Proxy the audio from Vercel Blob with auth
  const headers: Record<string, string> = {};
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    headers["Authorization"] = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }

  // Support range requests for seeking
  const range = request.headers.get("range");
  if (range) {
    headers["Range"] = range;
  }

  const response = await fetch(audioUrl, { headers });

  if (!response.ok && response.status !== 206) {
    return new NextResponse("Audio stream error", { status: 502 });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", response.headers.get("Content-Type") || "audio/mpeg");
  if (response.headers.get("Content-Length")) {
    responseHeaders.set("Content-Length", response.headers.get("Content-Length")!);
  }
  if (response.headers.get("Content-Range")) {
    responseHeaders.set("Content-Range", response.headers.get("Content-Range")!);
  }
  responseHeaders.set("Accept-Ranges", "bytes");
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
