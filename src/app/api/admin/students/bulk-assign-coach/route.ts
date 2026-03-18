import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * POST /api/admin/students/bulk-assign-coach
 * Assign a coach to multiple students at once.
 * Body: { studentIds: string[], coachId: string | null }
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    studentIds: string[];
    coachId: string | null;
  };

  if (!Array.isArray(body.studentIds) || body.studentIds.length === 0) {
    return NextResponse.json(
      { error: "studentIds must be a non-empty array" },
      { status: 400 },
    );
  }

  const coachId = body.coachId ?? null;

  // Validate the coach exists and is coach/admin (if assigning)
  if (coachId) {
    const coach = await db.query.users.findFirst({
      where: eq(users.id, coachId),
      columns: { id: true, role: true },
    });
    if (!coach || (coach.role !== "coach" && coach.role !== "admin")) {
      return NextResponse.json(
        { error: "Selected user is not a coach or admin" },
        { status: 400 },
      );
    }
  }

  // Update all students
  const updated = await db
    .update(users)
    .set({ assignedCoachId: coachId })
    .where(inArray(users.id, body.studentIds))
    .returning({ id: users.id });

  return NextResponse.json({
    success: true,
    updatedCount: updated.length,
    coachId,
  });
}
