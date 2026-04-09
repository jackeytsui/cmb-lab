import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

const ALLOWED_KEYS = [
  "accelerator.practice_plan.video_url",
  "accelerator.practice_plan.pdf_url",
  "accelerator.starter_pack.video_url",
  "accelerator.starter_pack.pdf_url",
  "accelerator.typing_unlock_kit.video_url",
  "accelerator.typing_unlock_kit.pdf_url",
  "tone_mastery.hero_video_url",
];

/**
 * GET /api/admin/accelerator/settings
 * Returns all accelerator settings.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.execute(
    sql`SELECT key, value FROM app_settings WHERE key LIKE 'accelerator.%' OR key LIKE 'tone_mastery.%'`
  );

  const settings: Record<string, string> = {};
  for (const row of rows.rows) {
    settings[row.key as string] = row.value as string;
  }

  return NextResponse.json({ settings });
}

/**
 * PUT /api/admin/accelerator/settings
 * Upsert a setting key-value pair.
 */
export async function PUT(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { key, value } = body;

  if (!key || typeof key !== "string" || !ALLOWED_KEYS.includes(key)) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }

  await db.execute(
    sql`INSERT INTO app_settings (key, value, updated_at) VALUES (${key}, ${value ?? ""}, now())
        ON CONFLICT (key) DO UPDATE SET value = ${value ?? ""}, updated_at = now()`
  );

  return NextResponse.json({ success: true });
}
