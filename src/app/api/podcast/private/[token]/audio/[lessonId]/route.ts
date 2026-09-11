import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules, podcastTokens, users } from "@/db/schema";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";
import { logPodcastDeliveryFailure } from "@/lib/podcast-delivery-log";
import { parsePodcastLessonPath } from "@/lib/podcast-feed";

export const maxDuration = 60;

/**
 * GET /api/podcast/private/[token]/audio/[lessonId]
 * Stream audio for a private podcast feed, authenticated by token.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; lessonId: string }> },
) {
  const { token, lessonId: lessonPath } = await params;
  const lessonId = parsePodcastLessonPath(lessonPath);
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    logPodcastDeliveryFailure({
      route: "audio",
      reason: "invalid_token_format",
      token,
      lessonId: lessonPath,
    });
    return new NextResponse("Unauthorized", { status: 403 });
  }
  if (!lessonId) {
    logPodcastDeliveryFailure({
      route: "audio",
      reason: "invalid_lesson_id",
      token,
      lessonId: lessonPath,
    });
    return new NextResponse("Lesson not found", { status: 404 });
  }

  // Bind the token to its user, series, and requested lesson in one query.
  const [record] = await db
    .select({
      userId: users.id,
      userRole: users.role,
      lessonContent: lessons.content,
      courseId: courses.id,
      courseTitle: courses.title,
      courseDescription: courses.description,
    })
    .from(podcastTokens)
    .innerJoin(users, eq(podcastTokens.userId, users.id))
    .innerJoin(courses, eq(podcastTokens.seriesId, courses.id))
    .innerJoin(modules, eq(modules.courseId, courses.id))
    .innerJoin(lessons, eq(lessons.moduleId, modules.id))
    .where(
      and(
        eq(podcastTokens.token, token),
        eq(lessons.id, lessonId),
        isNull(users.deletedAt),
        isNull(courses.deletedAt),
        eq(courses.isPublished, true),
        isNull(modules.deletedAt),
        isNull(lessons.deletedAt),
      ),
    )
    .limit(1);

  if (!record) {
    logPodcastDeliveryFailure({
      route: "audio",
      reason: "lesson_or_subscription_not_found",
      token,
      lessonId,
    });
    return new NextResponse("Lesson not found", { status: 404 });
  }

  if (
    !(await userCanAccessAudioCourse(
      { id: record.userId, role: record.userRole },
      {
        id: record.courseId,
        title: record.courseTitle,
        description: record.courseDescription,
      },
    ))
  ) {
    logPodcastDeliveryFailure({
      route: "audio",
      reason: "course_access_unavailable",
      token,
      seriesId: record.courseId,
      lessonId,
    });
    return new NextResponse("Lesson not found", { status: 404 });
  }

  // Parse audio URL from lesson content JSON
  let audioUrl = "";
  try {
    const content = JSON.parse(record.lessonContent ?? "{}");
    audioUrl = typeof content.audioUrl === "string" ? content.audioUrl : "";
  } catch {
    // no-op
  }

  if (!isPrivateVercelBlobUrl(audioUrl)) {
    logPodcastDeliveryFailure({
      route: "audio",
      reason: "audio_unavailable",
      token,
      seriesId: record.courseId,
      lessonId,
    });
    return new NextResponse("No audio available", { status: 404 });
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "podcast/private/audio",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
