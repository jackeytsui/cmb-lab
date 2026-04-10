import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * GET /api/course-library/download/[lessonId]
 * Authenticated proxy for download lessons. Adds Content-Disposition so
 * the browser prompts the user to save the file.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

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
  if (!fileUrl) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 404 });
  }

  const blobResponse = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!blobResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch file" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  const contentType =
    blobResponse.headers.get("content-type") ?? "application/octet-stream";
  responseHeaders.set("Content-Type", contentType);
  const safeName = fileName.replace(/[^a-zA-Z0-9 ._-]/g, "");
  responseHeaders.set(
    "Content-Disposition",
    `attachment; filename="${safeName}"`,
  );
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(blobResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}
