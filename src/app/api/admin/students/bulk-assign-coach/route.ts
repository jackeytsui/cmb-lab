import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";
import { coachAssignmentUpdate } from "@/lib/coach-assignment-change";

/**
 * POST /api/admin/students/bulk-assign-coach
 * Assign a primary coach to multiple students; preserve additional coaches.
 * Body: { studentIds: string[], coachId: string | null }
 * Requires admin role.
 */
export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = z.object({
    studentIds: z.array(z.uuid()).min(1).max(1000),
    coachId: z.uuid().nullable(),
  }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
        { error: "Provide valid student IDs and a primary coach or null" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const coachId = body.coachId;

  // Validate the coach exists and is coach/admin (if assigning)
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

  // Update all students
  const updated = await db
    .update(users)
    .set(coachAssignmentUpdate({ coachId }))
    .where(and(inArray(users.id, body.studentIds), eq(users.role, "student"), isNull(users.deletedAt)))
    .returning({ id: users.id });

  return NextResponse.json({
    success: true,
    updatedCount: updated.length,
    coachId,
  });
}
