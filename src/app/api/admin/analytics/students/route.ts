import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { getStudentsData } from "@/lib/admin-analytics-data";

/**
 * GET /api/admin/analytics/students
 * Returns at-risk students sorted by inactivity.
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
    const { searchParams } = new URL(request.url);
    const { from, to } = parseDateRange(searchParams);
    const daysInactive =
      parseInt(searchParams.get("daysInactive") || "7") || 7;
    const data = await getStudentsData(from, to, daysInactive);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching student analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch student analytics" },
      { status: 500 }
    );
  }
}
