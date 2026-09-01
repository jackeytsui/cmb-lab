import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { getOverviewData } from "@/lib/admin-analytics-data";

/**
 * GET /api/admin/analytics/overview
 * Returns high-level platform metrics.
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
    const data = await getOverviewData(from, to);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching overview analytics:", error);
    return NextResponse.json(
      {
        activeStudents: 0,
        totalStudents: 0,
        inactiveStudentsLoggedInOnce: 0,
        inactiveStudentsNeverLoggedIn: 0,
      },
      { status: 200 }
    );
  }
}
