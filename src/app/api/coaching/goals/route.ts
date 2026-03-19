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
    columns: { coachingGoals: true },
  });

  return NextResponse.json({
    goals: student?.coachingGoals ?? null,
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
    goals: string | null;
  };

  if (!body.studentEmail) {
    return NextResponse.json(
      { error: "studentEmail is required" },
      { status: 400 },
    );
  }

  const goalsValue = body.goals?.trim() || null;

  const [updated] = await db
    .update(users)
    .set({ coachingGoals: goalsValue })
    .where(eq(users.email, body.studentEmail))
    .returning({ id: users.id, coachingGoals: users.coachingGoals });

  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    goals: updated.coachingGoals,
  });
}
