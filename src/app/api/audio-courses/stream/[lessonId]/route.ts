import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleAudioLesson } from "@/lib/audio-course-lesson-access";
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
  const user = await getCurrentUser();
  if (!user || user.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const isDownload = request.nextUrl.searchParams.get("download") === "1";

  const lesson = await getAccessibleAudioLesson(user, lessonId);
  if (!lesson) {
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
