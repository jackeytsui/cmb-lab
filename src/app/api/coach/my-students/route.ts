import { studentAssignedToCoach } from "@/lib/coach-student-sql";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";

/**
 * GET /api/coach/my-students
 * Returns students assigned to the current coach (or all students for admins).
 * Excludes whitelisted students.
 */
export async function GET() {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const conditions = [
    eq(users.role, "student"),
    isNull(users.deletedAt),
    excludeWhitelistedUsersSql(users.id),
  ];

  // Coaches see only their assigned students; admins see all
  if (access.actor.role !== "admin") {
    conditions.push(studentAssignedToCoach(access.actor.id));
  }

  const studentRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
    })
    .from(users)
    .where(and(...conditions))
    .orderBy(users.name);

  return NextResponse.json({ students: studentRows });
}
