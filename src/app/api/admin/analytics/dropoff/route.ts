import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { getDropoffData } from "@/lib/admin-analytics-data";

/**
 * GET /api/admin/analytics/dropoff
 * Returns lessons ranked by drop-off frequency.
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
    const limit = parseInt(searchParams.get("limit") || "20") || 20;
    const data = await getDropoffData(from, to, limit);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching dropoff analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch dropoff analytics" },
      { status: 500 }
    );
  }
}
