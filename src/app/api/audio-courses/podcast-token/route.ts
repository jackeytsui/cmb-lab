import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { courses, podcastTokens } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";

const requestSchema = z.object({ seriesId: z.string().uuid() }).strict();

/**
 * POST /api/audio-courses/podcast-token
 * Generate or retrieve a private podcast feed token for the current user + series.
 * Body: { seriesId: string }
 */
export async function POST(request: NextRequest) {
  const dbUser = await getRealUser();
  if (!dbUser || dbUser.deletedAt) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  }
  const { seriesId } = parsed.data;

  const course = await db.query.courses.findFirst({
    where: and(
      eq(courses.id, seriesId),
      isNull(courses.deletedAt),
      eq(courses.isPublished, true),
    ),
    columns: { id: true, title: true, description: true },
  });
  if (!course || !(await userCanAccessAudioCourse(dbUser, course))) {
    return NextResponse.json({ error: "Series not found" }, { status: 404 });
  }

  // Check if token already exists for this user+series
  const existing = await db.query.podcastTokens.findFirst({
    where: and(
      eq(podcastTokens.userId, dbUser.id),
      eq(podcastTokens.seriesId, seriesId),
    ),
  });

  if (existing) {
    return NextResponse.json({ token: existing.token });
  }

  // Generate a new token
  const token = randomBytes(32).toString("hex");

  await db.insert(podcastTokens).values({
    userId: dbUser.id,
    seriesId,
    token,
  });

  return NextResponse.json({ token });
}
