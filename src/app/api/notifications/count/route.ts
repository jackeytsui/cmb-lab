import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

/**
 * GET /api/notifications/count
 * Returns the unread notification count for the current user.
 * Lightweight endpoint designed for 30-second polling.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [result] = await db
      .select({ unreadCount: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.read, false),
          isNull(notifications.deletedAt)
        )
      );

    return NextResponse.json({ unreadCount: result?.unreadCount ?? 0 });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
