import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_LANGUAGE_PREFERENCES = ["cantonese", "mandarin", "both"] as const;
const MIN_DAILY_GOAL_XP = 10;
const MAX_DAILY_GOAL_XP = 500;

/**
 * GET /api/user/preferences
 *
 * Fetch current user's preferences: languagePreference, dailyGoalXp, timezone, showCohortRankings.
 * Requires authentication via Clerk.
 */
export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.clerkId, clerkId),
      columns: {
        id: true,
        languagePreference: true,
        dailyGoalXp: true,
        timezone: true,
        showCohortRankings: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      languagePreference: user.languagePreference,
      dailyGoalXp: user.dailyGoalXp,
      timezone: user.timezone,
      showCohortRankings: user.showCohortRankings,
    });
  } catch (error) {
    console.error("Error fetching preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/user/preferences
 *
 * Update user's preferences. All fields are optional.
 * Requires authentication via Clerk.
 *
 * Body: {
 *   languagePreference?: "cantonese" | "mandarin" | "both",
 *   dailyGoalXp?: number (10-500),
 *   timezone?: string (IANA timezone),
 *   showCohortRankings?: boolean
 * }
 */
export async function PATCH(request: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { languagePreference, dailyGoalXp, timezone, showCohortRankings } = body;

    // Validate languagePreference value
    if (
      languagePreference !== undefined &&
      !VALID_LANGUAGE_PREFERENCES.includes(languagePreference)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid languagePreference. Must be: cantonese, mandarin, or both",
        },
        { status: 400 }
      );
    }

    // Validate dailyGoalXp value
    if (dailyGoalXp !== undefined) {
      if (
        typeof dailyGoalXp !== "number" ||
        !Number.isInteger(dailyGoalXp) ||
        dailyGoalXp < MIN_DAILY_GOAL_XP ||
        dailyGoalXp > MAX_DAILY_GOAL_XP
      ) {
        return NextResponse.json(
          {
            error: `Invalid dailyGoalXp. Must be an integer between ${MIN_DAILY_GOAL_XP} and ${MAX_DAILY_GOAL_XP}`,
          },
          { status: 400 }
        );
      }
    }

    // Validate timezone value (basic IANA format check)
    if (timezone !== undefined) {
      if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 64) {
        return NextResponse.json(
          { error: "Invalid timezone. Must be a non-empty string (IANA format)" },
          { status: 400 }
        );
      }
    }

    // Validate showCohortRankings value
    if (showCohortRankings !== undefined) {
      if (typeof showCohortRankings !== "boolean") {
        return NextResponse.json(
          { error: "showCohortRankings must be a boolean" },
          { status: 400 }
        );
      }
    }

    // Build update payload with only provided fields
    const updateData: Record<string, unknown> = {};
    if (languagePreference !== undefined) updateData.languagePreference = languagePreference;
    if (dailyGoalXp !== undefined) updateData.dailyGoalXp = dailyGoalXp;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (showCohortRankings !== undefined) updateData.showCohortRankings = showCohortRankings;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    // Update user preferences
    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.clerkId, clerkId))
      .returning({
        languagePreference: users.languagePreference,
        dailyGoalXp: users.dailyGoalXp,
        timezone: users.timezone,
        showCohortRankings: users.showCohortRankings,
      });

    if (!updated) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      languagePreference: updated.languagePreference,
      dailyGoalXp: updated.dailyGoalXp,
      timezone: updated.timezone,
      showCohortRankings: updated.showCohortRankings,
    });
  } catch (error) {
    console.error("Error updating preferences:", error);
    return NextResponse.json(
      { error: "Failed to update preferences" },
      { status: 500 }
    );
  }
}
