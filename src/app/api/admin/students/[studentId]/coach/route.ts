import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hasMinimumRole } from "@/lib/auth";

/**
 * PATCH /api/admin/students/[studentId]/coach
 * Assign or unassign a coach to a student.
 * Body: { coachId: string | null }
 * Requires admin role.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const body = await request.json();
  const { coachId } = body as { coachId: string | null };

  // Validate coachId if provided
  if (coachId !== null) {
    const coach = await db.query.users.findFirst({
      where: eq(users.id, coachId),
      columns: { id: true, role: true },
    });
    if (!coach) {
      return NextResponse.json({ error: "Coach not found" }, { status: 404 });
    }
    if (coach.role !== "coach" && coach.role !== "admin") {
      return NextResponse.json(
        { error: "Selected user is not a coach or admin" },
        { status: 400 },
      );
    }
  }

  const [updated] = await db
    .update(users)
    .set({ assignedCoachId: coachId })
    .where(eq(users.id, studentId))
    .returning({
      id: users.id,
      assignedCoachId: users.assignedCoachId,
    });

  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({ student: updated });
}
