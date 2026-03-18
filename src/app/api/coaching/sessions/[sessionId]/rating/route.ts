import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { coachingSessionRatings, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

async function getCurrentDbUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const dbUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, role: true },
  });
  return dbUser ?? null;
}

/**
 * GET /api/coaching/sessions/[sessionId]/rating
 * Get the current user's rating for this session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;

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
  const dbUser = await getCurrentDbUser();
  if (!dbUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only students can rate sessions
  if (dbUser.role !== "student") {
    return NextResponse.json({ error: "Only students can submit feedback" }, { status: 403 });
  }

  const { sessionId } = await params;
  const body = await request.json();
  const { rating, comment } = body as { rating: number; comment?: string };

  // Validate rating
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json(
      { error: "Rating must be an integer between 1 and 5" },
      { status: 400 },
    );
  }

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
    .returning();

  return NextResponse.json({ rating: result });
}
