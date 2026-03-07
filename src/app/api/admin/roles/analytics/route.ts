import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
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
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // If studentId is provided, return attribution data for that student
    const studentId = request.nextUrl.searchParams.get("studentId");
    if (studentId) {
      const attribution = await getAccessAttribution(studentId);
      return NextResponse.json({ attribution });
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
