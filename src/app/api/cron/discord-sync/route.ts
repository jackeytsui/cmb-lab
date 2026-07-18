// src/app/api/cron/discord-sync/route.ts
// Daily reconciliation between LMS tags and the Discord community.
// Safety net for anything the real-time tag hooks miss: expired access,
// members who left and re-linked, drifted roles, expired OAuth tokens.
// Schedule: daily at 9:00 AM UTC (configured in vercel.json)

import { NextResponse } from "next/server";
import { isDiscordConfigured } from "@/lib/discord/client";
import { syncAllLinkedUsers } from "@/lib/discord/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[Discord Cron] CRON_SECRET not set, skipping in development");
    return NextResponse.json({ skipped: true, reason: "no_cron_secret" });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDiscordConfigured()) {
    return NextResponse.json({ skipped: true, reason: "discord_not_configured" });
  }

  const stats = await syncAllLinkedUsers();
  console.log("[Discord Cron] Reconciliation complete:", stats);
  return NextResponse.json(stats);
}
