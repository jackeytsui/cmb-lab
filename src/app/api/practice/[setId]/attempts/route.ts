import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, practiceAttempts, practiceSets } from "@/db/schema";
import { eq, and, desc, isNull } from "drizzle-orm";
import {
  gradingLimiter,
  gradingLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import { awardXP } from "@/lib/xp-service";
import { canUserAccessPracticeSet } from "@/lib/assignments";

async function settleXpAwards(awards: Promise<unknown>[]) {
  const results = await Promise.allSettled(awards);
  for (const result of results) {
    if (result.status === "rejected") {
      console.error("[XP] Practice award failed:", result.reason);
    }
  }
}

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

    if (!(await canUserAccessPracticeSet(dbUser.id, setId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (
      score !== undefined &&
      score !== null &&
      (!Number.isInteger(score) || score < 0 || score > 100)
    ) {
      return NextResponse.json({ error: "Score must be an integer from 0 to 100" }, { status: 400 });
    }
    if (
      correctCount !== undefined &&
      (!Number.isInteger(correctCount) || correctCount < 0)
    ) {
      return NextResponse.json({ error: "correctCount must be a non-negative integer" }, { status: 400 });
    }
    const completedDate = completedAt ? new Date(completedAt) : null;
    if (completedAt && Number.isNaN(completedDate?.getTime())) {
      return NextResponse.json({ error: "completedAt must be a valid date" }, { status: 400 });
    }

    // 5. If attemptId provided, UPDATE existing attempt
    if (attemptId) {
      const existing = await db.query.practiceAttempts.findFirst({
        where: and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.practiceSetId, setId),
          eq(practiceAttempts.userId, dbUser.id),
        ),
      });
      if (!existing) {
        return NextResponse.json(
          { error: "Attempt not found or access denied" },
          { status: 404 },
        );
      }
      if (existing.completedAt) {
        return NextResponse.json({ attempt: existing }, { status: 200 });
      }

      const [updated] = await db
        .update(practiceAttempts)
        .set({
          correctCount: correctCount ?? 0,
          score: score ?? null,
          results: results ?? null,
          completedAt: completedDate,
        })
        .where(
          and(
            eq(practiceAttempts.id, attemptId),
            eq(practiceAttempts.practiceSetId, setId),
            eq(practiceAttempts.userId, dbUser.id),
            isNull(practiceAttempts.completedAt),
          )
        )
        .returning();

      if (!updated) {
        return NextResponse.json(
          { error: "Attempt not found or access denied" },
          { status: 404 }
        );
      }

      // Award XP before responding so serverless execution cannot drop it.
      if (completedDate && score != null) {
        const exerciseXP = Math.round((5 + (score / 100) * 5)) * updated.totalExercises;
        const awards = [awardXP({
          userId: dbUser.id,
          source: "practice_exercise",
          amount: exerciseXP,
          entityId: updated.id,
          entityType: "practice_attempt",
        })];

        // Award perfect bonus if score is 100
        if (score === 100) {
          awards.push(awardXP({
            userId: dbUser.id,
            source: "practice_perfect",
            amount: 25,
            entityId: updated.id,
            entityType: "practice_attempt",
          }));
        }
        await settleXpAwards(awards);
      }

      return NextResponse.json({ attempt: updated }, { status: 200 });
    }

    // 6. INSERT new attempt
    if (!Number.isInteger(totalExercises) || totalExercises < 1) {
      return NextResponse.json(
        { error: "Missing required field: totalExercises (must be >= 1)" },
        { status: 400 }
      );
    }

    const practiceSet = await db.query.practiceSets.findFirst({
      where: and(
        eq(practiceSets.id, setId),
        isNull(practiceSets.deletedAt),
      ),
      with: {
        exercises: {
          where: (exercise, { isNull: exerciseIsNull }) =>
            exerciseIsNull(exercise.deletedAt),
          columns: { id: true },
        },
      },
    });
    const actualExerciseCount = practiceSet?.exercises.length ?? 0;
    if (!practiceSet || practiceSet.status !== "published" || actualExerciseCount === 0) {
      return NextResponse.json({ error: "Practice set is unavailable" }, { status: 404 });
    }
    if (totalExercises !== actualExerciseCount) {
      return NextResponse.json({ error: "Exercise count does not match the practice set" }, { status: 400 });
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
        completedAt: completedDate,
      })
      .returning();

    // Award XP when a new attempt arrives already completed.
    if (completedDate && score != null) {
      const exerciseXP = Math.round((5 + (score / 100) * 5)) * actualExerciseCount;
      const awards = [awardXP({
        userId: dbUser.id,
        source: "practice_exercise",
        amount: exerciseXP,
        entityId: attempt.id,
        entityType: "practice_attempt",
      })];

      // Award perfect bonus if score is 100
      if (score === 100) {
        awards.push(awardXP({
          userId: dbUser.id,
          source: "practice_perfect",
          amount: 25,
          entityId: attempt.id,
          entityType: "practice_attempt",
        }));
      }
      await settleXpAwards(awards);
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

    if (!(await canUserAccessPracticeSet(dbUser.id, setId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
