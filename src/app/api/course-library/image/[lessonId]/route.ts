import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

// Match the 60s used by the other blob-proxy routes for consistency.
export const maxDuration = 60;

/**
 * GET /api/course-library/image/[lessonId]
 * Authenticated proxy for lesson thumbnail images stored in private Blob.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!(await canUserAccessCourseLibraryLesson(user, lessonId))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const [lesson] = await db
    .select({ content: courseLibraryLessons.content })
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

  const content = lesson.content as Record<string, unknown>;
  const thumbnailUrl = content.thumbnailUrl as string | undefined;
  if (!thumbnailUrl || !isPrivateVercelBlobUrl(thumbnailUrl)) {
    return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  }

  return proxyBlobMedia(request, thumbnailUrl, {
    fallbackContentType: "image/jpeg",
    label: "course-library/image",
  });
}
