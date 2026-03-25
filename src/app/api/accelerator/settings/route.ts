import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { sql } from "drizzle-orm";

/**
 * GET /api/accelerator/settings
 * Returns accelerator content settings (video URLs, PDF URLs) for students.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
