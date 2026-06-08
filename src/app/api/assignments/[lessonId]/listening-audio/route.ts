import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import type { ListeningPracticeConfig } from "@/lib/assignment-types";

/**
 * GET /api/assignments/[lessonId]/listening-audio
 * Authenticated proxy for the Listening Practice audio blob.
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
    columns: { lessonType: true, assignmentConfig: true },
  });

  if (!lesson || lesson.lessonType !== "listening_practice") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let config: ListeningPracticeConfig | null = null;
  try {
    config = lesson.assignmentConfig ? JSON.parse(lesson.assignmentConfig) : null;
  } catch {
    return NextResponse.json({ error: "Invalid config" }, { status: 500 });
  }

  if (!config?.audioBlobUrl) {
    return NextResponse.json({ error: "No audio uploaded for this lesson" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobRes = await fetch(config.audioBlobUrl, { headers });
  if (!blobRes.ok && blobRes.status !== 206) {
    return NextResponse.json({ error: "Failed to stream audio" }, { status: blobRes.status });
  }

  const responseHeaders = new Headers();
  responseHeaders.set("Content-Type", blobRes.headers.get("content-type") || "audio/mpeg");
  const cl = blobRes.headers.get("content-length");
  if (cl) responseHeaders.set("Content-Length", cl);
  const cr = blobRes.headers.get("content-range");
  if (cr) responseHeaders.set("Content-Range", cr);
  responseHeaders.set("Accept-Ranges", blobRes.headers.get("accept-ranges") || "bytes");
  responseHeaders.set("Cache-Control", "private, max-age=600");

  return new NextResponse(blobRes.body, { status: blobRes.status, headers: responseHeaders });
}
