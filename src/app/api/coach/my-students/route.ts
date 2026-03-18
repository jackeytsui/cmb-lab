import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";

/**
 * GET /api/coach/my-students
 * Returns students assigned to the current coach.
 * Only returns students where assignedCoachId matches the current user.
 */
export async function GET() {
  const isCoach = await hasMinimumRole("coach");
  if (!isCoach) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const studentRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(
      and(
        eq(users.role, "student"),
        eq(users.assignedCoachId, currentUser.id),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(users.name);

  return NextResponse.json({ students: studentRows });
}
