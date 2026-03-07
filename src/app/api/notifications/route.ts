import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, desc, isNull, and } from "drizzle-orm";

/**
 * GET /api/notifications
 * Returns paginated list of current user's notifications (excluding soft-deleted).
 * Ordered by most recent first, limited to 50.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notificationList = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          isNull(notifications.deletedAt)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return NextResponse.json({ notifications: notificationList });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
