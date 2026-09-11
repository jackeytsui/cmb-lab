import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";
import { isListeningPracticeLesson } from "@/lib/lesson-language";

// Each invocation serves at most one bounded chunk (see blob-media-proxy), so
// 60s is ample headroom even for long-form audio.
export const maxDuration = 60;

/**
 * GET /api/course-library/audio/[lessonId]
 * Authenticated chunked-range proxy for private Vercel Blob audio lessons and
 * the optional complete recording attached to a Listening Practice lesson.
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
  if (
    lesson.lessonType !== "audio" &&
    !isListeningPracticeLesson(lesson.lessonType)
  ) {
    return NextResponse.json(
      { error: "This lesson type does not support full audio" },
      { status: 400 },
    );
  }

  const content = lesson.content as Record<string, unknown>;
  const audioUrl =
    typeof content.audioUrl === "string" ? content.audioUrl.trim() : "";
  if (!audioUrl) {
    return NextResponse.json(
      { error: "No audio uploaded for this lesson" },
      { status: 404 },
    );
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "course-library/audio",
  });
}
