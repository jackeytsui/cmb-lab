import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryModules,
  courseLibraryCourses,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CourseLibraryListeningPracticeSentence } from "@/db/schema/course-library";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { isListeningPracticeLesson } from "@/lib/lesson-language";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";

// Match the 60s used by the other blob-proxy routes so long audio isn't cut
// off mid-transfer by the default function timeout.
export const maxDuration = 60;

/**
 * GET /api/course-library/listening-audio/[lessonId]?sentence=<id>
 *
 * Authenticated proxy that streams a Listening Practice sentence's optional
 * human-recording override from private Vercel Blob. Forwards Range headers so
 * the player can seek, and sets no-download / no-store headers so students
 * can't save the file. Sentences without an override fall back to TTS on the
 * client, so this only serves overrides.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const sentenceId = request.nextUrl.searchParams.get("sentence");
  if (!sentenceId) {
    return NextResponse.json({ error: "sentence required" }, { status: 400 });
  }

  const [lesson] = await db
    .select({
      content: courseLibraryLessons.content,
      lessonType: courseLibraryLessons.lessonType,
    })
    .from(courseLibraryLessons)
    .innerJoin(
      courseLibraryModules,
      eq(courseLibraryLessons.moduleId, courseLibraryModules.id),
    )
    .innerJoin(
      courseLibraryCourses,
      eq(courseLibraryModules.courseId, courseLibraryCourses.id),
    )
    .where(
      and(
        eq(courseLibraryLessons.id, lessonId),
        isNull(courseLibraryLessons.deletedAt),
        isNull(courseLibraryModules.deletedAt),
        isNull(courseLibraryCourses.deletedAt),
        inArray(
          courseLibraryCourses.status,
          visibleCourseStatuses(viewer?.role),
        ),
      ),
    )
    .limit(1);

  if (!lesson || !isListeningPracticeLesson(lesson.lessonType)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (!(await canUserAccessCourseLibraryLesson(viewer, lessonId))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const content = (lesson.content ?? {}) as Record<string, unknown>;
  const sentences = Array.isArray(content.sentences)
    ? (content.sentences as CourseLibraryListeningPracticeSentence[])
    : [];
  const sentence = sentences.find((s) => s.id === sentenceId);
  const audioUrl = sentence?.audioUrl;
  if (!audioUrl || !isPrivateVercelBlobUrl(audioUrl)) {
    return NextResponse.json({ error: "No audio for sentence" }, { status: 404 });
  }

  return proxyBlobMedia(request, audioUrl, {
    fallbackContentType: "audio/mpeg",
    label: "course-library/listening-audio",
    extraHeaders: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": "inline",
    },
  });
}
