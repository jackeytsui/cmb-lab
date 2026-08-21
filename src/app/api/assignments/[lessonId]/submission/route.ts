import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { lessonSubmissions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";

/**
 * GET /api/assignments/[lessonId]/submission
 * Returns the authenticated student's existing submission (if any) for this lesson,
 * including the coach review if available.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const dbUser = await getRealUser();
  if (!dbUser || dbUser.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  if (!z.string().uuid().safeParse(lessonId).success) {
    return NextResponse.json({ submission: null });
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
