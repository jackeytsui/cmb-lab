// src/lib/lab-assistant/notifications.ts
// Discord notifications for Lab Assistant handovers — mirrors the team's GHL
// operations-form automation: every escalation/testimonial creates a GHL task
// AND fires a message into the ops Discord channel.
//
// Configure DISCORD_WEBHOOK_URL (Discord channel → Integrations → Webhooks).
// Failures are logged but never break the student-facing flow.

const COLOR_URGENT = 0xef4444; // red
const COLOR_ESCALATION = 0xf59e0b; // amber
const COLOR_TESTIMONIAL = 0x22c55e; // green
const COLOR_FAILED = 0x991b1b; // dark red

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

export function isDiscordConfigured(): boolean {
  return !!process.env.DISCORD_WEBHOOK_URL;
}

/**
 * Fire-and-forget Discord ping for a handover. Safe to call unconditionally:
 * no-ops when the webhook isn't configured, and never throws.
 */
export async function sendDiscordHandoverNotification(
  notification: HandoverNotification
): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
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
