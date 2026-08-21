import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { courses, lessons, modules, podcastTokens, users } from "@/db/schema";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

export const maxDuration = 60;

/**
 * GET /api/podcast/private/[token]/audio/[lessonId]
 * Stream audio for a private podcast feed, authenticated by token.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; lessonId: string }> },
) {
  const { token, lessonId } = await params;
  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return new NextResponse("Unauthorized", { status: 403 });
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

  if (
    !record ||
    !(await userCanAccessAudioCourse(
      { id: record.userId, role: record.userRole },
      {
        id: record.courseId,
        title: record.courseTitle,
        description: record.courseDescription,
      },
    ))
  ) {
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
    return new NextResponse("No audio available", { status: 404 });
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "podcast/private/audio",
    extraHeaders: { "Content-Disposition": "inline" },
  });
}
