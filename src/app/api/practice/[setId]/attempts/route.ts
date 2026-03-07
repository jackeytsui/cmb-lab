import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, practiceAttempts } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import {
  gradingLimiter,
  gradingLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import { awardXP } from "@/lib/xp-service";

/**
 * POST /api/practice/[setId]/attempts
 * Creates a new practice attempt or updates an existing one.
 *
 * Body (create): { totalExercises, correctCount?, score?, results?, completedAt? }
 * Body (update): { attemptId, correctCount, score, results, completedAt? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  // 1. Auth check
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1b. Rate limiting
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "student";
  const limiter = selectLimiter(role, gradingLimiter, gradingLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  try {
    // 2. Get setId from params
    const { setId } = await params;

    // 3. Parse body
    const body = await request.json();
    const { attemptId, totalExercises, correctCount, score, results, completedAt } = body;

    // 4. Look up internal user ID
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 5. If attemptId provided, UPDATE existing attempt
    if (attemptId) {
      const [updated] = await db
        .update(practiceAttempts)
        .set({
          correctCount: correctCount ?? 0,
          score: score ?? null,
          results: results ?? null,
          completedAt: completedAt ? new Date(completedAt) : null,
        })
        .where(
          and(
            eq(practiceAttempts.id, attemptId),
            eq(practiceAttempts.userId, dbUser.id)
          )
        )
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: "Attempt not found or access denied" },
          { status: 404 }
        );
      }

      // Fire-and-forget: award XP when attempt is completed with a score
      if (completedAt && score != null && totalExercises) {
        const exerciseXP = Math.round((5 + (score / 100) * 5)) * totalExercises;
        awardXP({
          userId: dbUser.id,
          source: "practice_exercise",
          amount: exerciseXP,
          entityId: setId,
          entityType: "practice_set",
        }).catch((err) => console.error("[XP] Practice XP award failed:", err));

        // Award perfect bonus if score is 100
        if (score === 100) {
          awardXP({
            userId: dbUser.id,
            source: "practice_perfect",
            amount: 25,
            entityId: setId,
            entityType: "practice_set",
          }).catch((err) => console.error("[XP] Perfect bonus award failed:", err));
        }
      }

      return NextResponse.json({ attempt: updated }, { status: 200 });
    }

    // 6. INSERT new attempt
    if (!totalExercises || totalExercises < 1) {
      return NextResponse.json(
        { error: "Missing required field: totalExercises (must be >= 1)" },
        { status: 400 }
      );
    }

    const [attempt] = await db
      .insert(practiceAttempts)
      .values({
        practiceSetId: setId,
        userId: dbUser.id,
        totalExercises,
        correctCount: correctCount ?? 0,
        score: score ?? null,
        results: results ?? null,
        completedAt: completedAt ? new Date(completedAt) : null,
      })
      .returning();

    // Fire-and-forget: award XP when new attempt is created already completed
    if (completedAt && score != null) {
      const exerciseXP = Math.round((5 + (score / 100) * 5)) * totalExercises;
      awardXP({
        userId: dbUser.id,
        source: "practice_exercise",
        amount: exerciseXP,
        entityId: setId,
        entityType: "practice_set",
      }).catch((err) => console.error("[XP] Practice XP award failed:", err));

      // Award perfect bonus if score is 100
      if (score === 100) {
        awardXP({
          userId: dbUser.id,
          source: "practice_perfect",
          amount: 25,
          entityId: setId,
          entityType: "practice_set",
        }).catch((err) => console.error("[XP] Perfect bonus award failed:", err));
      }
    }

    return NextResponse.json({ attempt }, { status: 201 });
  } catch (error) {
    console.error("Practice attempt API error:", error);
    return NextResponse.json(
      { error: "Failed to save practice attempt" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/practice/[setId]/attempts
 * Returns the current user's attempts for a specific practice set.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ setId: string }> }
) {
  // 1. Auth check
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1b. Rate limiting (use grading limiter for reads too)
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "student";
  const limiter = selectLimiter(role, gradingLimiter, gradingLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  try {
    // 2. Get setId from params
    const { setId } = await params;

    // 3. Look up internal user ID
    const dbUser = await db.query.users.findFirst({
      where: eq(users.clerkId, userId),
      columns: { id: true },
    });

    if (!dbUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 4. Query attempts for this user and set, ordered by most recent
    const attempts = await db.query.practiceAttempts.findMany({
      where: and(
        eq(practiceAttempts.practiceSetId, setId),
        eq(practiceAttempts.userId, dbUser.id)
      ),
      orderBy: [desc(practiceAttempts.startedAt)],
    });

    return NextResponse.json({ attempts });
  } catch (error) {
    console.error("Practice attempts list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch practice attempts" },
      { status: 500 }
    );
  }
}
