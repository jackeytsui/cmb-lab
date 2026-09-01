import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { parseDateRange } from "@/lib/analytics";
import { getDifficultyData } from "@/lib/admin-analytics-data";

/**
 * GET /api/admin/analytics/difficulty
 * Returns lessons ranked by average attempts to pass interactions.
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
    const data = await getDifficultyData(from, to);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching difficulty analytics:", error);
    return NextResponse.json(
      { error: "Failed to fetch difficulty analytics" },
      { status: 500 }
    );
  }
}
