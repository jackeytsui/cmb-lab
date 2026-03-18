import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, studentTags, tags } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { excludeWhitelistedUsersSql } from "@/lib/analytics-whitelist";

/**
 * GET /api/coach/my-students
 * Returns students assigned to the current coach (or all students for admins).
 * Excludes whitelisted students.
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

  const isAdmin = currentUser.role === "admin";

  const conditions = [
    eq(users.role, "student"),
    isNull(users.deletedAt),
    excludeWhitelistedUsersSql(users.id),
  ];

  // Coaches see only their assigned students; admins see all
  if (!isAdmin) {
    conditions.push(eq(users.assignedCoachId, currentUser.id));
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
