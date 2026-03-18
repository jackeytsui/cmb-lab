import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * PATCH /api/admin/students/[studentId]/coach
 * Assign or unassign a coach to a student.
 * Body: { coachId: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const body = (await request.json()) as { coachId: string | null };
  const coachId = body.coachId ?? null;

  // Validate the coach exists and is actually a coach (if assigning)
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

  // Update the student's assigned coach
  const [updated] = await db
    .update(users)
    .set({ assignedCoachId: coachId })
    .where(eq(users.id, studentId))
    .returning({ id: users.id, assignedCoachId: users.assignedCoachId });

  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, assignedCoachId: updated.assignedCoachId });
}
