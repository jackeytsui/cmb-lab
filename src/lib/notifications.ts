import { db } from "@/db";
import { notifications, notificationPreferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Creates an in-app notification for a user, respecting their mute preferences.
 *
 * Checks the user's notification preferences before inserting. If the user
 * has muted the given category, the notification is silently skipped (returns null).
 *
 * This is a server-only function -- call from API routes or server actions only.
 */
export async function createNotification(params: {
  userId: string;
  type: "coach_feedback" | "submission_graded" | "course_access" | "system";
  category: "feedback" | "progress" | "system";
  title: string;
  body: string;
  linkUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  // Check if the user has muted this notification category
  const [preference] = await db
    .select({ muted: notificationPreferences.muted })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, params.userId),
        eq(notificationPreferences.category, params.category)
      )
    )
    .limit(1);

  if (preference?.muted) {
    return null;
  }

  // Insert the notification
  const [created] = await db
    .insert(notifications)
    .values({
      userId: params.userId,
      type: params.type,
      category: params.category,
      title: params.title,
      body: params.body,
      linkUrl: params.linkUrl,
      metadata: params.metadata ? JSON.stringify(params.metadata) : undefined,
    })
    .returning();

  return created;
}
