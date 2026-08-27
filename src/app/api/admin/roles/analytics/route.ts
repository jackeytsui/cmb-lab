import { NextRequest, NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import { getStaffStudentAccessContext } from "@/lib/staff-student-access";
import {
  getRolesWithActiveStudentCounts,
  getExpiringAssignments,
  getMultiRoleStudents,
  getAccessAttribution,
} from "@/lib/role-analytics";

/**
 * GET /api/admin/roles/analytics
 * Returns role analytics: active student counts, expiring assignments, multi-role students.
 * With ?studentId={id}: returns access attribution for a specific student.
 */
export async function GET(request: NextRequest) {
  const access = await getStaffStudentAccessContext();
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (access.status !== "authorized") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // If studentId is provided, return attribution data for that student
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (studentId) {
      const student = await db.query.users.findFirst({
        where: and(eq(users.id, studentId), isNull(users.deletedAt)),
        columns: { assignedCoachId: true },
      });
      if (
        !student ||
        !canStaffAccessStudent({
          actorUserId: access.actor.id,
          actorRole: access.actor.role,
          assignedCoachId: student.assignedCoachId,
        })
      ) {
        return NextResponse.json(
          { error: "Student not found" },
          { status: 404 },
        );
      }
      const attribution = await getAccessAttribution(studentId);
      return NextResponse.json({ attribution });
    }

    if (access.actor.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Otherwise return the dashboard analytics
    const [roles, expiring7d, expiring30d, multiRoleStudents] =
      await Promise.all([
        getRolesWithActiveStudentCounts(),
        getExpiringAssignments(7),
        getExpiringAssignments(30),
        getMultiRoleStudents(),
      ]);

    return NextResponse.json({
      roles,
      expiring7d,
      expiring30d,
      multiRoleStudents,
    });
  } catch (error) {
    console.error("Error fetching role analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch role analytics" },
      { status: 500 }
    );
  }
}
