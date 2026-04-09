import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, podcastTokens } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { randomBytes } from "crypto";

/**
 * POST /api/audio-courses/podcast-token
 * Generate or retrieve a private podcast feed token for the current user + series.
 * Body: { seriesId: string }
 */
export async function POST(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true },
  });
  if (!dbUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const { seriesId } = await request.json();
  if (!seriesId) {
    return NextResponse.json({ error: "seriesId required" }, { status: 400 });
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
