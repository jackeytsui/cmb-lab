import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";

/**
 * PATCH /api/admin/students/[studentId]/coach
 * Assign or unassign a coach to a student.
 * NOTE: Requires migration 0028 (assignedCoachId column). Returns 503 until migration is run.
 */
export async function PATCH(
  _request: Request,
  { params: _params }: { params: Promise<{ studentId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // This feature requires database migration 0028 to add the assigned_coach_id column.
  return NextResponse.json(
    { error: "Coach assignment requires database migration 0028. Please run pending migrations." },
    { status: 503 },
  );
}
