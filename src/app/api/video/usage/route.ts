import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users, videoSessions } from "@/db/schema";
import { eq, and, gte, count } from "drizzle-orm";
import { getTranscriptLimitSettings, getPeriodStart } from "@/lib/usage-limits";

/**
 * GET /api/video/usage
 *
 * Returns the user's current transcript usage and limit info.
 * Coaches and admins have unlimited access.
 */
export async function GET() {
  try {
    const { userId: clerkUserId } = await auth();
    if (!clerkUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkUserId),
      columns: { id: true, role: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 401 });
    }

    // Coaches and admins are unlimited
    if (user.role === "coach" || user.role === "admin") {
      return NextResponse.json({
        used: 0,
        limit: -1, // -1 = unlimited
        period: "unlimited",
        remaining: -1,
      });
    }

    // Get settings with fallback defaults
    const { limitCount, period } = await getTranscriptLimitSettings();

    // Count sessions created in the current period
    const periodStart = getPeriodStart(period);
    const [result] = await db
      .select({ total: count() })
      .from(videoSessions)
      .where(
        and(
          eq(videoSessions.userId, user.id),
          gte(videoSessions.createdAt, periodStart)
        )
      );

    const used = Number(result?.total ?? 0);

    return NextResponse.json({
      used,
      limit: limitCount,
      period,
      remaining: Math.max(0, limitCount - used),
    });
  } catch (error) {
    console.error("Usage check error:", error);
    return NextResponse.json(
      { error: "Failed to check usage" },
      { status: 500 }
    );
  }
}
