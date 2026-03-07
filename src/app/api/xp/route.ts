import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getXPDashboard } from "@/lib/xp-service";

/**
 * GET /api/xp
 *
 * Returns the authenticated user's XP dashboard data:
 * - Level info (level, currentLevelXP, nextLevelXP, totalXP)
 * - Streak info (currentStreak, longestStreak, freezesUsedThisMonth, freezesRemaining)
 * - Daily activity (totalXp, lessonCount, practiceCount, conversationCount, goalXp, goalMet)
 * - Ring data (learn, practice, speak — 0-1 progress ratios)
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dashboard = await getXPDashboard(user.id);

    return NextResponse.json(dashboard);
  } catch (error) {
    console.error("Error fetching XP dashboard:", error);
    return NextResponse.json(
      { error: "Failed to fetch XP dashboard" },
      { status: 500 }
    );
  }
}
