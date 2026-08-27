import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { getCoachingStudentAccess } from "@/lib/coaching-student-access";

/**
 * GET /api/coaching/goals?studentEmail=...
 * Returns the coaching goals for a student (by email).
 * Coaches/admins can query any student; students get their own.
 */
export async function GET(request: NextRequest) {
  const access = await getCoachingStudentAccess(
    request.nextUrl.searchParams.get("studentEmail"),
  );
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const student = await db.query.users.findFirst({
    where: eq(users.id, access.student.id),
    columns: { coachingGoals: true, coachingLevel: true, coachingLessonNumber: true },
  });

  return NextResponse.json({
    goals: student?.coachingGoals ?? null,
    level: student?.coachingLevel ?? null,
    lessonNumber: student?.coachingLessonNumber ?? null,
  });
}

/**
 * PATCH /api/coaching/goals
 * Update coaching goals for a student.
 * Body: { studentEmail: string, goals: string | null }
 * Requires coach role.
 */
export async function PATCH(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    studentEmail: string;
    goals?: string | null;
    level?: string | null;
    lessonNumber?: string | null;
  };

  if (!body.studentEmail) {
    return NextResponse.json(
      { error: "studentEmail is required" },
      { status: 400 },
    );
  }

  const access = await getCoachingStudentAccess(body.studentEmail);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  // Always update all three fields (null = no change from client means keep existing)
  const goalsValue = "goals" in body ? (body.goals?.trim() || null) : undefined;
  const levelValue = "level" in body ? (body.level?.trim() || null) : undefined;
  const lessonValue = "lessonNumber" in body ? (body.lessonNumber?.trim() || null) : undefined;

  if (goalsValue === undefined && levelValue === undefined && lessonValue === undefined) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Build SET clause with explicit column references
  const setClause: {
    coachingGoals?: string | null;
    coachingLevel?: string | null;
    coachingLessonNumber?: string | null;
  } = {};
  if (goalsValue !== undefined) setClause.coachingGoals = goalsValue;
  if (levelValue !== undefined) setClause.coachingLevel = levelValue;
  if (lessonValue !== undefined) setClause.coachingLessonNumber = lessonValue;

  try {
    const [updated] = await db
      .update(users)
      .set(setClause)
      .where(eq(users.id, access.student.id))
      .returning({
        id: users.id,
        coachingGoals: users.coachingGoals,
        coachingLevel: users.coachingLevel,
        coachingLessonNumber: users.coachingLessonNumber,
      });

    if (!updated) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      goals: updated.coachingGoals,
      level: updated.coachingLevel,
      lessonNumber: updated.coachingLessonNumber,
    });
  } catch (err) {
    console.error("Failed to update coaching goals:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
