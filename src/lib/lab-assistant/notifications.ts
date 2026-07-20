// src/lib/lab-assistant/notifications.ts
// Discord notifications for Lab Assistant handovers — mirrors the team's GHL
// operations-form automation: every escalation/testimonial creates a GHL task
// AND fires a message into the issue-escalation Discord channel.
//
// The webhook URL is configured from the admin block (stored in app_settings)
// with the DISCORD_WEBHOOK_URL env var as a fallback. Failures are logged but
// never break the student-facing flow.

import { db } from "@/db";
import { appSettings } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DISCORD_WEBHOOK_SETTING_KEY = "lab_assistant_discord_webhook_url";

const WEBHOOK_CACHE_MS = 60 * 1000;
let webhookCache: { url: string | null; expires: number } | null = null;

/** Clear the cached webhook URL (call after the admin updates the setting). */
export function invalidateDiscordWebhookCache(): void {
  webhookCache = null;
}

/** Resolve the webhook URL: app_settings first, env var fallback. */
export async function getDiscordWebhookUrl(): Promise<string | null> {
  if (webhookCache && webhookCache.expires > Date.now()) {
    return webhookCache.url;
  }
  let url: string | null = null;
  try {
    const row = await db.query.appSettings.findFirst({
      where: eq(appSettings.key, DISCORD_WEBHOOK_SETTING_KEY),
      columns: { value: true },
    });
    url = row?.value?.trim() || null;
  } catch (error) {
    console.error(
      "[Lab Assistant] Discord webhook setting lookup failed:",
      error instanceof Error ? error.message : error
    );
  }
  url = url || process.env.DISCORD_WEBHOOK_URL || null;
  webhookCache = { url, expires: Date.now() + WEBHOOK_CACHE_MS };
  return url;
}

export async function isDiscordConfigured(): Promise<boolean> {
  return !!(await getDiscordWebhookUrl());
}

const COLOR_URGENT = 0xef4444; // red
const COLOR_ESCALATION = 0xf59e0b; // amber
const COLOR_TESTIMONIAL = 0x22c55e; // green
const COLOR_FAILED = 0x991b1b; // dark red
const COLOR_TEST = 0x3a49b8; // CMB blue

export interface HandoverNotification {
  kind: "escalation" | "testimonial";
  studentName: string;
  studentEmail: string;
  intent: string | null;
  urgent: boolean;
  dueDate: Date;
  /** "student" = task on their contact, "ops" = fallback contact, "failed" = no task created */
  taskVia: "student" | "ops" | "failed";
  /** Last student message, truncated — the task body carries the full transcript. */
  lastMessage: string | null;
}

/**
 * Fire-and-forget Discord ping for a handover. Safe to call unconditionally:
 * no-ops when the webhook isn't configured, and never throws.
 */
export async function sendDiscordHandoverNotification(
  notification: HandoverNotification
): Promise<void> {
  const webhookUrl = await getDiscordWebhookUrl();
  if (!webhookUrl) return;

  const {
    kind,
    studentName,
    studentEmail,
    intent,
    urgent,
    dueDate,
    taskVia,
    lastMessage,
  } = notification;

  const title =
    kind === "testimonial"
      ? `🎤 Testimonial interview request — ${studentName}`
      : `${urgent ? "🚨" : "🔔"} Lab Bot escalation — ${intent ?? "unclassified"} — ${studentName}`;

  const color =
    taskVia === "failed"
      ? COLOR_FAILED
      : urgent
        ? COLOR_URGENT
        : kind === "testimonial"
          ? COLOR_TESTIMONIAL
          : COLOR_ESCALATION;

  const fields = [
    { name: "Student", value: `${studentName} (${studentEmail})`, inline: true },
    {
      name: "Due",
      value: `<t:${Math.floor(dueDate.getTime() / 1000)}:R>`,
      inline: true,
    },
    {
      name: "GHL task",
      value:
        taskVia === "student"
          ? "Created on the student's contact"
          : taskVia === "ops"
            ? "Created on the CMB Lab Operations contact"
            : "⚠️ FAILED — no task created, follow up manually",
      inline: false,
    },
  ];

  if (lastMessage) {
    fields.push({
      name: "Last message",
      value:
        lastMessage.length > 300
          ? `${lastMessage.slice(0, 300)}…`
          : lastMessage,
      inline: false,
    });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title,
            color,
            fields,
            footer: { text: "CMB Lab Assistant — full transcript in the GHL task" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        `[Lab Assistant] Discord webhook returned ${response.status}`
      );
    }
  } catch (error) {
    console.error(
      "[Lab Assistant] Discord notification failed:",
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Send a test embed so the admin can verify the channel wiring. Returns the
 * outcome instead of throwing. Accepts an explicit URL (pre-save validation)
 * or uses the configured one.
 */
export async function sendDiscordTestMessage(
  urlOverride?: string
): Promise<{ ok: boolean; error?: string }> {
  const webhookUrl = urlOverride?.trim() || (await getDiscordWebhookUrl());
  if (!webhookUrl) return { ok: false, error: "No webhook configured" };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: "✅ CMB Lab Assistant connected",
            description:
              "Escalations and testimonial requests will be posted in this channel, alongside their GHL tasks.",
            color: COLOR_TEST,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!response.ok) {
      return { ok: false, error: `Discord returned ${response.status}` };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}
