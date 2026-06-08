import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, lessonSubmissions, lessonReviews } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/assignments/[lessonId]/submission
 * Returns the authenticated student's existing submission (if any) for this lesson,
 * including the coach review if available.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const submission = await db.query.lessonSubmissions.findFirst({
    where: and(
      eq(lessonSubmissions.lessonId, lessonId),
      eq(lessonSubmissions.userId, dbUser.id),
    ),
    with: { review: true },
  });

  return NextResponse.json({ submission: submission ?? null });
}
