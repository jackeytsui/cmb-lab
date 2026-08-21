import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { verifySignedMediaPath } from "@/lib/signed-media-url";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";

// Each invocation now serves at most one bounded chunk (see blob-media-proxy),
// so 60s is ample headroom — the timeout can no longer kill a transfer that a
// browser is still waiting on.
export const maxDuration = 300;

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
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Download deterrents on top of session auth. The URL must carry a fresh
  // HMAC signature minted by the lesson page, so a URL copied out of dev
  // tools expires within hours instead of working forever. And a direct
  // browser navigation (address bar / "Save Page As" on the URL) is
  // refused — only actual media playback fetches are served.
  const url = request.nextUrl;
  if (
    !verifySignedMediaPath(
      url.pathname,
      url.searchParams.get("exp"),
      url.searchParams.get("sig"),
    )
  ) {
    return NextResponse.json(
      { error: "This video link has expired — reload the lesson page." },
      { status: 403 },
    );
  }
  if (request.headers.get("sec-fetch-dest") === "document") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  if (!(await canUserAccessCourseLibraryLesson(user, lessonId))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

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
