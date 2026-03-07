import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, lte, isNull } from "drizzle-orm";

/**
 * POST /api/notifications/read-all
 * Mark all unread notifications as read up to a specific timestamp
 * This timestamp boundary prevents race conditions with newly created notifications
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { before } = body;

    // Validate timestamp
    if (!before || isNaN(Date.parse(before))) {
      return NextResponse.json(
        { error: "Invalid timestamp" },
        { status: 400 }
      );
    }

    const beforeDate = new Date(before);

    // Update all unread notifications created before the timestamp
    const result = await db
      .update(notifications)
      .set({
        read: true,
        readAt: new Date(),
      })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.read, false),
          lte(notifications.createdAt, beforeDate),
          isNull(notifications.deletedAt)
        )
      );

    return NextResponse.json({ updated: result.rowCount || 0 });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return NextResponse.json(
      { error: "Failed to update notifications" },
      { status: 500 }
    );
  }
}
