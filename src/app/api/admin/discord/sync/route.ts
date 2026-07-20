// POST /api/admin/discord/sync
// Manually trigger a Discord sync: pass { userId } for one student, or no
// body/empty body to reconcile every linked user. Requires admin role.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hasMinimumRole } from "@/lib/auth";
import { isDiscordConfigured } from "@/lib/discord/client";
import { syncAllLinkedUsers, syncUserDiscord } from "@/lib/discord/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const bodySchema = z.object({ userId: z.string().uuid().optional() });

export async function POST(req: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isDiscordConfigured()) {
    return NextResponse.json(
      { error: "Discord bot is not configured (DISCORD_BOT_TOKEN, DISCORD_GUILD_ID)" },
      { status: 503 }
    );
  }

  try {
    const raw = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    if (parsed.data.userId) {
      const result = await syncUserDiscord(parsed.data.userId);
      return NextResponse.json({ result });
    }

    const stats = await syncAllLinkedUsers();
    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Error running Discord sync:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 }
    );
  }
}
