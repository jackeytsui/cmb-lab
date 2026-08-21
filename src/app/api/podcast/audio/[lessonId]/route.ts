import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { isPublicAudioCourse } from "@/lib/audio-course-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

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

  const [lesson] = await db
    .select({
      content: lessons.content,
      courseId: courses.id,
      courseTitle: courses.title,
      courseDescription: courses.description,
    })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(
      and(
        eq(lessons.id, lessonId),
        isNull(lessons.deletedAt),
        isNull(modules.deletedAt),
        isNull(courses.deletedAt),
        eq(courses.isPublished, true),
      ),
    )
    .limit(1);

  if (
    !lesson ||
    !(await isPublicAudioCourse({
      id: lesson.courseId,
      title: lesson.courseTitle,
      description: lesson.courseDescription,
    }))
  ) {
    return new NextResponse("Not found", { status: 404 });
  }

  let audioUrl = "";
  try {
    const content = JSON.parse(lesson.content ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!isPrivateVercelBlobUrl(audioUrl)) {
    return new NextResponse("No audio", { status: 404 });
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "podcast/audio",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
