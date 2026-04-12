import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryLessons } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

/**
 * GET /api/course-library/image/[lessonId]
 * Authenticated proxy for lesson thumbnail images stored in private Blob.
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
    .select({ content: courseLibraryLessons.content })
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
  const thumbnailUrl = content.thumbnailUrl as string | undefined;
  if (!thumbnailUrl) {
    return NextResponse.json({ error: "No thumbnail" }, { status: 404 });
  }

  const blobResponse = await fetch(thumbnailUrl, {
    headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
  });
  if (!blobResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch image" },
      { status: blobResponse.status },
    );
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "Content-Type",
    blobResponse.headers.get("content-type") ?? "image/jpeg",
  );
  responseHeaders.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(blobResponse.body, {
    status: 200,
    headers: responseHeaders,
  });
}
