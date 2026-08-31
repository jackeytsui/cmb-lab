import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryModules,
  courseLibraryCourses,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CourseLibraryVocalHackContent } from "@/db/schema/course-library";
import { visibleCourseStatuses } from "@/lib/course-library-access";
import { isVocalHackLesson } from "@/lib/lesson-language";
import { verifySignedMediaPath } from "@/lib/signed-media-url";
import { privateMediaPlaybackRedirect } from "@/lib/private-media-playback";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";

// Authorization/signing only. Video bytes are served directly by Blob.
export const maxDuration = 60;

/**
 * GET /api/course-library/vocal-hack-video/[lessonId]?sentence=<id>
 *
 * Authenticates access to a sentence, then issues a single-file, expiring GET
 * URL. Blob handles Range requests without serverless chunk handoffs.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  if (!lesson || !isVocalHackLesson(lesson.lessonType)) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }
  if (!(await canUserAccessCourseLibraryLesson(viewer, lessonId))) {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const content = (lesson.content ?? {}) as CourseLibraryVocalHackContent;
  const sentence = Array.isArray(content.sentences)
    ? content.sentences.find((s) => s.id === sentenceId)
    : undefined;
  const videoUrl = sentence?.videoUrl;
  if (!videoUrl || !isPrivateVercelBlobUrl(videoUrl)) {
    return NextResponse.json({ error: "No video for sentence" }, { status: 404 });
  }

  return privateMediaPlaybackRedirect(videoUrl, "course-library/vocal-hack-video");
}
