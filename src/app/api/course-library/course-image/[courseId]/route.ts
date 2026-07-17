import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { courseLibraryCourses } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

// Match the 60s used by the other blob-proxy routes for consistency.
export const maxDuration = 60;

/**
 * GET /api/course-library/course-image/[courseId]
 * Authenticated, same-origin proxy for a course's cover image. Serving it
 * through our own origin (rather than the raw blob URL) keeps it inside the
 * `img-src 'self'` CSP and lets us attach the blob store token for private
 * uploads. Imported (external) cover URLs are fetched as-is.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;

  const [course] = await db
    .select({ coverImageUrl: courseLibraryCourses.coverImageUrl })
    .from(courseLibraryCourses)
    .where(
      and(
        eq(courseLibraryCourses.id, courseId),
        isNull(courseLibraryCourses.deletedAt),
      ),
    )
    .limit(1);

  if (!course?.coverImageUrl) {
    return NextResponse.json({ error: "No cover image" }, { status: 404 });
  }

  // Our uploaded covers live in the private blob store and need the token;
  // imported URLs point elsewhere and are fetched without it.
  const headers: Record<string, string> = {};
  let isVercelBlob = false;
  try {
    isVercelBlob = new URL(course.coverImageUrl).hostname.endsWith(
      ".vercel-storage.com",
    );
  } catch {
    return NextResponse.json({ error: "Invalid cover image" }, { status: 400 });
  }
  if (isVercelBlob) {
    headers.Authorization = `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}`;
  }

  const blobResponse = await fetch(course.coverImageUrl, { headers });
  if (!blobResponse.ok) {
    return NextResponse.json(
      { error: "Failed to fetch cover image" },
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
