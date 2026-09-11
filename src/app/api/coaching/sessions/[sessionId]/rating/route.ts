import { NextResponse } from "next/server";
import { db } from "@/db";
import { coachingSessionRatings } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser, getRealUser } from "@/lib/auth";
import { getRateableCoachingSession } from "@/lib/coaching-session-rating-access";
import { z } from "zod";

const ratingSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2_000).optional(),
});

/**
 * GET /api/coaching/sessions/[sessionId]/rating
 * Get the current user's rating for this session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const dbUser = await getCurrentUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const session = await getRateableCoachingSession(dbUser, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const rating = await db.query.coachingSessionRatings.findFirst({
    where: and(
      eq(coachingSessionRatings.sessionId, sessionId),
      eq(coachingSessionRatings.userId, dbUser.id),
    ),
  });

  return NextResponse.json({ rating: rating ?? null });
}

/**
 * POST /api/coaching/sessions/[sessionId]/rating
 * Create the current user's rating for this session (one-time only).
 * Body: { rating: number (1-5), comment?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  // Mutations always use the real signed-in identity. An administrator using
  // View As can inspect the student experience but cannot rate for them.
  const dbUser = await getRealUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only students can rate sessions
  if (dbUser.role !== "student") {
    return NextResponse.json({ error: "Only students can submit feedback" }, { status: 403 });
  }

  const { sessionId } = await params;
  const session = await getRateableCoachingSession(dbUser, sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = ratingSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid feedback" },
      { status: 400 },
    );
  }
  const { rating, comment } = parsed.data;

  // Check if rating already exists — one submission per session per student
  const existing = await db.query.coachingSessionRatings.findFirst({
    where: and(
      eq(coachingSessionRatings.sessionId, sessionId),
      eq(coachingSessionRatings.userId, dbUser.id),
    ),
  });

  if (existing) {
    return NextResponse.json(
      { error: "You have already submitted feedback for this session" },
      { status: 409 },
    );
  }

  const [result] = await db
    .insert(coachingSessionRatings)
    .values({
      sessionId,
      userId: dbUser.id,
      rating,
      comment: comment ?? null,
    })
    .onConflictDoNothing({
      target: [
        coachingSessionRatings.sessionId,
        coachingSessionRatings.userId,
      ],
    })
    .returning();

  if (!result) {
    return NextResponse.json(
      { error: "You have already submitted feedback for this session" },
      { status: 409 },
    );
  }

  return NextResponse.json({ rating: result });
}
