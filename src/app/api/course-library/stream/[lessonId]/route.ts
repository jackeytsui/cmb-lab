import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * GET /api/course-library/stream/[lessonId]
 * Authenticated proxy for private Vercel Blob video lessons.
 * Forwards Range headers for seeking support.
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

  const [lesson] = await db
    .select({
      content: courseLibraryLessons.content,
      lessonType: courseLibraryLessons.lessonType,
    })
    .from(courseLibraryLessons)
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
      ),
    )
    .limit(1);

  if (!lesson) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (lesson.lessonType !== "video") {
    return NextResponse.json({ error: "Not a video lesson" }, { status: 400 });
  }

  const content = lesson.content as Record<string, unknown>;
  const videoUrl = content.videoUrl as string | undefined;
  if (!videoUrl) {
    return NextResponse.json(
      { error: "No video uploaded for this lesson" },
      { status: 404 },
    );
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobResponse = await fetch(videoUrl, { headers });
  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  const contentType = blobResponse.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  else responseHeaders.set("Content-Type", "video/mp4");
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  const acceptRanges = blobResponse.headers.get("accept-ranges");
  responseHeaders.set("Accept-Ranges", acceptRanges ?? "bytes");
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
