import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/admin/usage-limits
 * Returns current transcript usage limit settings.
 */
export async function GET() {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const rows = await db.select().from(appSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({
      limitCount: parseInt(settings.transcript_limit_count ?? "5", 10),
      period: settings.transcript_limit_period ?? "weekly",
    });
  } catch {
    // Table might not exist yet
    return NextResponse.json({
      limitCount: 5,
      period: "weekly",
    });
  }
}

/**
 * PATCH /api/admin/usage-limits
 * Update transcript usage limit settings.
 * Body: { limitCount?: number, period?: "daily" | "weekly" | "monthly" }
 */
export async function PATCH(request: Request) {
  const isAdmin = await hasMinimumRole("admin");
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { limitCount, period } = body as {
    limitCount?: number;
    period?: string;
  };

  try {
    if (limitCount !== undefined) {
      const count = Math.max(1, Math.round(limitCount));
      await db
        .insert(appSettings)
        .values({
          key: "transcript_limit_count",
          value: String(count),
          description:
            "Maximum number of YouTube transcriptions per student per period",
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: String(count) },
        });
    }

    if (
      period === "daily" ||
      period === "weekly" ||
      period === "monthly"
    ) {
      await db
        .insert(appSettings)
        .values({
          key: "transcript_limit_period",
          value: period,
          description: "Period for transcript limit: daily, weekly, or monthly",
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: period },
        });
    }

    // Read back current values
    const rows = await db.select().from(appSettings);
    const settings: Record<string, string> = {};
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return NextResponse.json({
      limitCount: parseInt(settings.transcript_limit_count ?? "5", 10),
      period: settings.transcript_limit_period ?? "weekly",
    });
  } catch (err) {
    console.error("Failed to update usage limits:", err);
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
