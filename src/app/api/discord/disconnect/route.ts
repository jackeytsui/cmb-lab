// src/app/api/discord/disconnect/route.ts
// Lets a student unlink their Discord account from CMB Lab.
// Does not kick them from the server -- the next reconciliation handles that
// based on their entitlement at the time.

import { NextResponse } from "next/server";
import { db } from "@/db";
import { discordConnections } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getRealUser } from "@/lib/auth";
import { logDiscordAction } from "@/lib/discord/sync";

export async function POST() {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const deleted = await db
    .delete(discordConnections)
    .where(eq(discordConnections.userId, user.id))
    .returning({ discordUserId: discordConnections.discordUserId });

  if (deleted.length > 0) {
    await logDiscordAction({
      userId: user.id,
      discordUserId: deleted[0].discordUserId,
      action: "account.unlink",
    });
  }

  return NextResponse.json({ success: true, removed: deleted.length > 0 });
}
