import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";

// Each invocation now serves at most one bounded chunk (see blob-media-proxy),
// so 60s is ample headroom — the timeout can no longer kill a transfer that a
// browser is still waiting on.
export const maxDuration = 60;

/**
 * GET /api/course-library/stream/[lessonId]
 * Authenticated chunked-range proxy for private Vercel Blob video lessons.
 * Open-ended Range requests are clamped to bounded chunks so a single
 * serverless invocation never has to stream the whole file (which previously
 * got killed at maxDuration mid-transfer, leaving players on an endless
 * spinner). Browsers follow up with sequential range requests automatically.
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

  return proxyBlobMedia(request, videoUrl, {
    fallbackContentType: "video/mp4",
    label: "course-library/stream",
  });
}
