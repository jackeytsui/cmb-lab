import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import {
  courseLibraryLessons,
  courseLibraryModules,
  courseLibraryCourses,
  users,
} from "@/db/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CourseLibraryVocalHackContent } from "@/db/schema/course-library";
import { visibleCourseStatuses } from "@/lib/course-library-access";

/**
 * GET /api/course-library/vocal-hack-video/[lessonId]?sentence=<id>
 *
 * Authenticated proxy that streams a Vocal Hack sentence's coach video from
 * private Vercel Blob. Forwards Range headers for seeking, and sets
 * no-download / no-store headers so students can't save the file.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const viewer = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { role: true },
  });

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

  if (!lesson || lesson.lessonType !== "vocal_hack") {
    return NextResponse.json({ error: "Lesson not found" }, { status: 404 });
  }

  const content = (lesson.content ?? {}) as CourseLibraryVocalHackContent;
  const sentence = Array.isArray(content.sentences)
    ? content.sentences.find((s) => s.id === sentenceId)
    : undefined;
  const videoUrl = sentence?.videoUrl;
  if (!videoUrl) {
    return NextResponse.json({ error: "No video for sentence" }, { status: 404 });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`,
  };
  const range = request.headers.get("range");
  if (range) headers["Range"] = range;

  const blobResponse = await fetch(videoUrl, { headers });
  if (!blobResponse.ok && blobResponse.status !== 206) {
    return NextResponse.json(
      { error: "Failed to fetch video" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResponse.headers.get("content-type") ?? "video/mp4",
  );
  const contentLength = blobResponse.headers.get("content-length");
  if (contentLength) responseHeaders.set("Content-Length", contentLength);
  const contentRange = blobResponse.headers.get("content-range");
  if (contentRange) responseHeaders.set("Content-Range", contentRange);
  responseHeaders.set(
    "Accept-Ranges",
    blobResponse.headers.get("accept-ranges") ?? "bytes",
  );
  responseHeaders.set("Cache-Control", "private, no-store");
  responseHeaders.set("Content-Disposition", "inline");

  return new NextResponse(blobResponse.body, {
    status: blobResponse.status,
    headers: responseHeaders,
  });
}
