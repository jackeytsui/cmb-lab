import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hasMinimumRole } from "@/lib/auth";

/**
 * GET /api/admin/coaches
 * Returns all users with role "coach" (not admins).
 * Used by bulk assign coach and coach dropdowns.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const coachRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(isNull(users.deletedAt), eq(users.role, "coach")))
    .orderBy(users.name);

  return NextResponse.json({ coaches: coachRows });
}
