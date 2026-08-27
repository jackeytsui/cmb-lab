import { NextRequest, NextResponse } from "next/server";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import {
  SIGNED_MEDIA_TTL_SECONDS,
  verifySignedMediaPath,
} from "@/lib/signed-media-url";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";

// Each invocation now serves at most one bounded chunk (see blob-media-proxy),
// so 60s is ample headroom — the timeout can no longer kill a transfer that a
// browser is still waiting on.
export const maxDuration = 300;

/**
 * GET /api/course-library/stream/[lessonId]
 * Authenticated redirect to a path-scoped, short-lived private Blob URL.
 * Keeping the serverless function in the byte-stream path caused some valid
 * MP4 range requests to remain open indefinitely. After access is verified,
 * the browser now talks directly to Blob storage, which handles Range requests
 * without the extra function hop.
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

  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token || /\s/.test(token)) {
    console.error(
      "[course-library/stream] BLOB_READ_WRITE_TOKEN is not configured",
    );
    return NextResponse.json(
      { error: "Media storage is not configured" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  let pathname: string;
  try {
    const blob = new URL(videoUrl);
    if (!blob.hostname.endsWith(".private.blob.vercel-storage.com")) {
      throw new Error("not a private Vercel Blob URL");
    }
    pathname = decodeURIComponent(blob.pathname.replace(/^\//, ""));
  } catch {
    return NextResponse.json(
      { error: "Video storage URL is invalid" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const validUntil = Date.now() + SIGNED_MEDIA_TTL_SECONDS * 1000;
    const signedToken = await issueSignedToken({
      token,
      pathname,
      operations: ["get"],
      validUntil,
    });
    const { presignedUrl } = await presignUrl(signedToken, {
      operation: "get",
      pathname,
      access: "private",
      validUntil,
    });
    const response = NextResponse.redirect(presignedUrl, 307);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    console.error(
      "[course-library/stream] Failed to issue private playback URL:",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Failed to prepare video playback" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
