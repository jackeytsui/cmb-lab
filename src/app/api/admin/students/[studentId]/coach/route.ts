import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { coachAssignmentChangeSchema, coachAssignmentUpdate } from "@/lib/coach-assignment-change";

/**
 * PATCH /api/admin/students/[studentId]/coach
 * Set the primary coach OR add/remove one additional coach, never replace the
 * shared list from a stale client snapshot. No GHL writes or notifications.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentId } = await params;
  const parsed = coachAssignmentChangeSchema.safeParse(await request.json().catch(() => null));
  if (!z.uuid().safeParse(studentId).success || !parsed.success) {
    return NextResponse.json({ error: "Provide a valid student and exactly one coach change" }, { status: 400 });
  }
  const body = parsed.data;
  const coachId = "coachId" in body ? body.coachId : "addCoachId" in body ? body.addCoachId : null;

  // Validate the coach exists and is actually a coach (if assigning)
  if (coachId) {
    const coach = await db.query.users.findFirst({
      where: and(eq(users.id, coachId), isNull(users.deletedAt)),
      columns: { id: true, role: true },
    });
    if (!coach || (coach.role !== "coach" && coach.role !== "admin")) {
      return NextResponse.json(
        { error: "Selected user is not a coach or admin" },
        { status: 400 },
      );
    }
  }

  const [updated] = await db
    .update(users)
    .set(coachAssignmentUpdate(body))
    .where(and(eq(users.id, studentId), eq(users.role, "student"), isNull(users.deletedAt)))
    .returning({ id: users.id, assignedCoachId: users.assignedCoachId, additionalCoachIds: users.additionalCoachIds });

  if (!updated) {
    return NextResponse.json({ error: "Student not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, ...updated });
}
