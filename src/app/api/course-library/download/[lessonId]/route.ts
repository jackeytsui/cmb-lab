import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { canUserAccessCourseLibraryLesson } from "@/lib/course-library-lesson-access";
import { proxyBlobMedia } from "@/lib/blob-media-proxy";
import { isPrivateVercelBlobUrl } from "@/lib/videoask/media-storage";

// Downloadable files can be large; match the 60s used by the other blob-proxy
// routes so the transfer isn't cut off by the default function timeout.
export const maxDuration = 60;

/**
 * GET /api/course-library/download/[lessonId]
 * Authenticated proxy for download lessons. Adds Content-Disposition so
 * the browser prompts the user to save the file.
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
  if (lesson.lessonType !== "download") {
    return NextResponse.json(
      { error: "Not a download lesson" },
      { status: 400 },
    );
  }

  const content = lesson.content as Record<string, unknown>;
  const fileUrl = content.fileUrl as string | undefined;
  const fileName = (content.fileName as string | undefined) ?? "download";
  if (!fileUrl || !isPrivateVercelBlobUrl(fileUrl)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 404 });
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9 ._-]/g, "");
  return proxyBlobMedia(request, fileUrl, {
    fallbackContentType: "application/octet-stream",
    label: "course-library/download",
    extraHeaders: {
      "Content-Disposition": `attachment; filename="${safeName || "download"}"`,
    },
  });
}
