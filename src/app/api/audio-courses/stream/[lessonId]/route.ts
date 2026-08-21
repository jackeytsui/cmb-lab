import { NextRequest, NextResponse } from "next/server";
import { eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/audio-courses/stream/[lessonId]
 * Authenticated proxy for private Vercel Blob audio files.
 * Supports Range headers for seeking.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const user = await getRealUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const isDownload = request.nextUrl.searchParams.get("download") === "1";

  const [lesson] = await db
    .select({
      content: lessons.content,
      title: lessons.title,
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
    !(await userCanAccessAudioCourse(user, {
      id: lesson.courseId,
      title: lesson.courseTitle,
      description: lesson.courseDescription,
    }))
  ) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  let audioUrl = "";
  try {
    const content = JSON.parse(lesson.content ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!isPrivateVercelBlobUrl(audioUrl)) {
    return NextResponse.json({ error: "No audio for this lesson" }, { status: 404 });
  }

  const extraHeaders: Record<string, string> = {};
  if (isDownload) {
    const pathExtension = new URL(audioUrl).pathname.split(".").pop()?.toLowerCase();
    const ext = pathExtension && /^(mp3|m4a|mp4|wav|ogg|flac|webm)$/.test(pathExtension)
      ? pathExtension
      : "mp3";
    const safeName = (lesson.title || "audio").replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "audio";
    extraHeaders["Content-Disposition"] = `attachment; filename="${safeName}.${ext}"`;
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "audio-courses/stream",
    extraHeaders,
  });
}
