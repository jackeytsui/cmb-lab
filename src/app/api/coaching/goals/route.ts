import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/coaching/goals?studentEmail=...
 * Returns the coaching goals for a student (by email).
 * Coaches/admins can query any student; students get their own.
 */
export async function GET(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const callerUser = await db.query.users.findFirst({
    where: eq(users.clerkId, clerkId),
    columns: { id: true, email: true, role: true },
  });
  if (!callerUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const studentEmail =
    request.nextUrl.searchParams.get("studentEmail") || callerUser.email;

  // Students can only see their own goals
  const isCoachOrAdmin = await hasMinimumRole("coach");
  if (!isCoachOrAdmin && studentEmail !== callerUser.email) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const student = await db.query.users.findFirst({
    where: eq(users.email, studentEmail),
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

  const updates: Partial<{
    coachingGoals: string | null;
    coachingLevel: string | null;
    coachingLessonNumber: string | null;
  }> = {};
  if ("goals" in body) updates.coachingGoals = body.goals?.trim() || null;
  if ("level" in body) updates.coachingLevel = body.level?.trim() || null;
  if ("lessonNumber" in body) updates.coachingLessonNumber = body.lessonNumber?.trim() || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.email, body.studentEmail))
    .returning({ id: users.id, coachingGoals: users.coachingGoals, coachingLevel: users.coachingLevel, coachingLessonNumber: users.coachingLessonNumber });

  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    goals: updated.coachingGoals,
    level: updated.coachingLevel,
    lessonNumber: updated.coachingLessonNumber,
  });
}
