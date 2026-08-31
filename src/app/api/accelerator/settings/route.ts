import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { userCanUseFeature } from "@/lib/feature-access";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/accelerator/settings
 * Returns accelerator content settings (video URLs, PDF URLs) for students.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await userCanUseFeature(user, "mandarin_accelerator"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.execute(
    sql`SELECT key, value FROM app_settings WHERE key LIKE 'accelerator.%'`
  );

  const settings: Record<string, string> = {};
  for (const row of rows.rows) {
    settings[row.key as string] = row.value as string;
  }

  return NextResponse.json({ settings });
}
