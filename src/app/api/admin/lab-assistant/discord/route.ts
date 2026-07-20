// src/app/api/admin/lab-assistant/discord/route.ts
// Configure the issue-escalation Discord webhook from the admin block:
// GET → configured state, PUT → save/clear the URL (validated with a test
// ping before saving), POST → send a test message to the configured webhook.

import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  DISCORD_WEBHOOK_SETTING_KEY,
  getDiscordWebhookUrl,
  invalidateDiscordWebhookCache,
  sendDiscordTestMessage,
} from "@/lib/lab-assistant/notifications";

const WEBHOOK_PATTERN =
  /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//;

export async function GET() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = await getDiscordWebhookUrl();
  return NextResponse.json({
    configured: !!url,
    // Masked — enough to recognise the channel without exposing the secret.
    maskedUrl: url ? `…${url.slice(-8)}` : null,
  });
}

export async function PUT(request: NextRequest) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const url = typeof body.url === "string" ? body.url.trim() : "";

    if (url && !WEBHOOK_PATTERN.test(url)) {
      return NextResponse.json(
        {
          error:
            "That doesn't look like a Discord webhook URL (expected https://discord.com/api/webhooks/…)",
        },
        { status: 400 }
      );
    }

    // Verify the webhook actually works before saving it.
    if (url) {
      const test = await sendDiscordTestMessage(url);
      if (!test.ok) {
        return NextResponse.json(
          { error: `Webhook test failed: ${test.error}` },
          { status: 400 }
        );
      }
    }

    if (url) {
      await db
        .insert(appSettings)
        .values({
          key: DISCORD_WEBHOOK_SETTING_KEY,
          value: url,
          description:
            "Discord webhook for Lab Assistant escalation/testimonial alerts (issue-escalation channel)",
        })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: url },
        });
    } else {
      await db
        .delete(appSettings)
        .where(eq(appSettings.key, DISCORD_WEBHOOK_SETTING_KEY));
    }

    invalidateDiscordWebhookCache();
    return NextResponse.json({ success: true, configured: !!url });
  } catch (error) {
    console.error("[Lab Assistant] Discord setting update failed:", error);
    return NextResponse.json(
      { error: "Failed to save Discord webhook" },
      { status: 500 }
    );
  }
}

export async function POST() {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await sendDiscordTestMessage();
  return result.ok
    ? NextResponse.json({ success: true })
    : NextResponse.json({ error: result.error }, { status: 400 });
}
