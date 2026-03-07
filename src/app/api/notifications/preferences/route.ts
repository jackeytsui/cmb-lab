import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { notificationPreferences } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/notifications/preferences
 * Returns user's notification preferences for all categories
 * Returns default preferences (all unmuted) if none exist
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, user.id));

    // If no preferences exist, return default (all unmuted)
    if (preferences.length === 0) {
      return NextResponse.json({
        preferences: [
          { category: "feedback", muted: false },
          { category: "progress", muted: false },
          { category: "system", muted: false },
        ],
      });
    }

    return NextResponse.json({ preferences });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/notifications/preferences
 * Update mute setting for a specific notification category
 * Upserts the preference row
 */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { category, muted } = body;

    // Validate inputs
    if (!category || typeof muted !== "boolean") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    // Validate category enum
    const validCategories = ["feedback", "progress", "system"];
    if (!validCategories.includes(category)) {
      return NextResponse.json(
        { error: "Invalid category" },
        { status: 400 }
      );
    }

    // Check if preference exists
    const existing = await db
      .select()
      .from(notificationPreferences)
      .where(
        and(
          eq(notificationPreferences.userId, user.id),
          eq(notificationPreferences.category, category)
        )
      )
      .limit(1);

    let preference;

    if (existing.length > 0) {
      // Update existing preference
      [preference] = await db
        .update(notificationPreferences)
        .set({ muted, updatedAt: new Date() })
        .where(
          and(
            eq(notificationPreferences.userId, user.id),
            eq(notificationPreferences.category, category)
          )
        )
        .returning();
    } else {
      // Insert new preference
      [preference] = await db
        .insert(notificationPreferences)
        .values({
          userId: user.id,
          category,
          muted,
        })
        .returning();
    }

    return NextResponse.json(preference);
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
