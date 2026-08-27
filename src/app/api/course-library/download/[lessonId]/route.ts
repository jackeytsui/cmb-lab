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
 * Authenticated proxy for download lessons and uploaded lesson attachments.
 * Adds Content-Disposition so the browser prompts the user to save the file.
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
  const content = lesson.content as Record<string, unknown>;
  const attachmentParam = request.nextUrl.searchParams.get("attachment");
  let fileUrl: string | undefined;
  let fileName = "download";
  let label = "course-library/download";

  if (attachmentParam !== null) {
    if (!/^\d+$/.test(attachmentParam)) {
      return NextResponse.json(
        { error: "Attachment not found" },
        { status: 404 },
      );
    }
    const attachments = Array.isArray(content.attachments)
      ? (content.attachments as Array<Record<string, unknown>>)
      : [];
    const attachment = attachments[Number(attachmentParam)];
    fileUrl =
      typeof attachment?.url === "string" ? attachment.url : undefined;
    fileName =
      typeof attachment?.filename === "string"
        ? attachment.filename
        : "attachment";
    label = "course-library/attachment";
  } else {
    if (lesson.lessonType !== "download") {
      return NextResponse.json(
        { error: "Not a download lesson" },
        { status: 400 },
      );
    }
    fileUrl =
      typeof content.fileUrl === "string" ? content.fileUrl : undefined;
    fileName =
      typeof content.fileName === "string" ? content.fileName : "download";
  }

  if (!fileUrl || !isPrivateVercelBlobUrl(fileUrl)) {
    return NextResponse.json(
      {
        error:
          attachmentParam === null
            ? "No file uploaded"
            : "Attachment not found",
      },
      { status: 404 },
    );
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9 ._-]/g, "");
  return proxyBlobMedia(request, fileUrl, {
    fallbackContentType: "application/octet-stream",
    label,
    extraHeaders: {
      "Content-Disposition": `attachment; filename="${safeName || "download"}"`,
    },
  });
}
