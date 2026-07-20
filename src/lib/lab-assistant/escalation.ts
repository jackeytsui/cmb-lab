// src/lib/lab-assistant/escalation.ts
// Handover layer: escalation and testimonial requests become GHL tasks on the
// student's own contact (single-contact scope enforced by student-context.ts).

import { type User } from "@/db/schema";
import { createGhlClient, getAnyActiveGhlLocation } from "@/lib/ghl/client";
import { createContactTask } from "@/lib/ghl/tasks";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { SUPPORT_EMAIL } from "./allowlist";
import { sendDiscordHandoverNotification } from "./notifications";

const ESCALATION_DUE_HOURS = 24;
const URGENT_DUE_HOURS = 4; // same-day follow-up for urgent signals

// -----------------------------------------------------------------------
// Operations fallback contact.
// Handover must ALWAYS land in GHL (like the team's operations form). When
// the requester has no linked GHL contact — or the task on their contact
// fails — the task is created on a dedicated ops contact instead, upserted
// on demand so the fallback always exists.
// -----------------------------------------------------------------------

const OPS_CONTACT_CACHE_MS = 10 * 60 * 1000;
let opsContactCache: {
  value: { contactId: string; locationId: string };
  expires: number;
} | null = null;

async function resolveOpsContact(): Promise<{
  contactId: string;
  locationId: string;
} | null> {
  if (opsContactCache && opsContactCache.expires > Date.now()) {
    return opsContactCache.value;
  }

  try {
    const location = await getAnyActiveGhlLocation();
    if (!location) return null;

    const email = process.env.GHL_OPS_CONTACT_EMAIL || SUPPORT_EMAIL;
    const client = createGhlClient(location.apiToken);
    const response = await client.post<{ contact: { id: string } }>(
      "/contacts/upsert",
      {
        email,
        name: "CMB Lab Operations",
        locationId: location.ghlLocationId,
      }
    );

    const contactId = response.data.contact?.id;
    if (!contactId) return null;

    const value = { contactId, locationId: location.ghlLocationId };
    opsContactCache = { value, expires: Date.now() + OPS_CONTACT_CACHE_MS };
    return value;
  } catch (error) {
    console.error(
      "[Lab Assistant] Ops contact resolution failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export interface EscalationParams {
  user: User;
  ghlContactId: string | null;
  intent: string | null;
  confidence: number | null;
  transcript: string;
  urgent: boolean;
}

export interface HandoverResult {
  ok: boolean;
  taskId: string | null;
}

function dueDateFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function studentDisplayName(user: User): string {
  return user.name?.trim() || user.email;
}

/** Last student line of the transcript, for the Discord notification. */
function lastStudentMessage(transcript: string): string | null {
  const lines = transcript
    .split("\n")
    .filter((l) => l.startsWith("Student: "));
  const last = lines[lines.length - 1];
  return last ? last.slice("Student: ".length) : null;
}

/**
 * Create the `[Lab Bot] Escalation` task on the student's GHL contact.
 * Body carries the full transcript + detected intent + confidence + timestamp
 * so the team has everything without opening the app.
 */
export async function createEscalationTask(
  params: EscalationParams
): Promise<HandoverResult> {
  const { user, ghlContactId, intent, confidence, transcript, urgent } = params;

  const title = `[Lab Bot] Escalation — ${intent ?? "unclassified"} — ${studentDisplayName(user)}`;
  const body = [
    `Student: ${studentDisplayName(user)} <${user.email}>`,
    `Detected intent: ${intent ?? "unclassified"}`,
    `Confidence: ${confidence !== null ? confidence.toFixed(2) : "n/a"}`,
    `Urgent: ${urgent ? "YES — same-day follow-up" : "no"}`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "--- Transcript ---",
    transcript,
  ].join("\n");

  return createHandoverTask({
    user,
    ghlContactId,
    title,
    body,
    dueDate: dueDateFromNow(urgent ? URGENT_DUE_HOURS : ESCALATION_DUE_HOURS),
    eventType: "lab_assistant.escalation",
    notify: {
      kind: "escalation",
      intent,
      urgent,
      lastMessage: lastStudentMessage(transcript),
    },
  });
}

/**
 * Intent 5: always create the testimonial interview task (Sheldon) and let
 * the bot confirm to the student.
 */
export async function createTestimonialTask(params: {
  user: User;
  ghlContactId: string | null;
  transcript: string;
}): Promise<HandoverResult> {
  const { user, ghlContactId, transcript } = params;

  const body = [
    `Student: ${studentDisplayName(user)} <${user.email}>`,
    `Request: testimonial interview with Sheldon (via Lab Assistant)`,
    `Timestamp: ${new Date().toISOString()}`,
    "",
    "--- Transcript ---",
    transcript,
  ].join("\n");

  return createHandoverTask({
    user,
    ghlContactId,
    title: "Testimonial interview request",
    body,
    dueDate: dueDateFromNow(ESCALATION_DUE_HOURS),
    eventType: "lab_assistant.testimonial_request",
    notify: {
      kind: "testimonial",
      intent: "testimonial_sheldon",
      urgent: false,
      lastMessage: lastStudentMessage(transcript),
    },
  });
}

async function createHandoverTask(params: {
  user: User;
  ghlContactId: string | null;
  title: string;
  body: string;
  dueDate: Date;
  eventType: string;
  notify: {
    kind: "escalation" | "testimonial";
    intent: string | null;
    urgent: boolean;
    lastMessage: string | null;
  };
}): Promise<HandoverResult> {
  const { user, ghlContactId, title, body, dueDate, eventType, notify } =
    params;

  // Every handover pings the ops Discord channel (mirrors the GHL form
  // automation). Never throws; no-op when DISCORD_WEBHOOK_URL is unset.
  const notifyDiscord = (taskVia: "student" | "ops" | "failed") =>
    sendDiscordHandoverNotification({
      kind: notify.kind,
      studentName: studentDisplayName(user),
      studentEmail: user.email,
      intent: notify.intent,
      urgent: notify.urgent,
      dueDate,
      taskVia,
      lastMessage: notify.lastMessage,
    });

  const logOutcome = (
    payload: Record<string, unknown>,
    status?: "failed",
    contactId?: string
  ) =>
    logSyncEvent({
      eventType,
      direction: "outbound",
      entityType: "lab_assistant",
      entityId: user.id,
      ghlContactId: contactId,
      // Redacted analytics payload: no transcript / PII beyond the task link.
      payload,
      ...(status ? { status } : {}),
    }).catch(() => {
      console.error("[Lab Assistant] Failed to log handover event");
    });

  // 1st choice: task on the student's own contact.
  if (ghlContactId) {
    try {
      const taskId = await createContactTask(ghlContactId, {
        title,
        body,
        dueDate,
      });
      await logOutcome(
        { title, taskId, dueDate: dueDate.toISOString(), via: "student" },
        undefined,
        ghlContactId
      );
      await notifyDiscord("student");
      return { ok: true, taskId };
    } catch (error) {
      console.error(
        "[Lab Assistant] Handover on student contact failed, trying ops fallback:",
        error instanceof Error ? error.message : error
      );
    }
  }

  // Fallback: task on the operations contact, so the request still lands in
  // GHL even when the requester has no linked contact (or their task failed).
  const ops = await resolveOpsContact();
  if (ops) {
    try {
      const taskId = await createContactTask(
        ops.contactId,
        {
          title: `${title} — ${user.email}`,
          body,
          dueDate,
        },
        ops.locationId
      );
      await logOutcome(
        {
          title,
          taskId,
          dueDate: dueDate.toISOString(),
          via: "ops",
          reason: ghlContactId
            ? "student contact task failed"
            : "no linked GHL contact",
        },
        undefined,
        ops.contactId
      );
      await notifyDiscord("ops");
      return { ok: true, taskId };
    } catch (error) {
      console.error(
        "[Lab Assistant] Ops fallback task creation failed:",
        error instanceof Error ? error.message : error
      );
      await logOutcome(
        {
          title,
          error: `Ops fallback failed: ${error instanceof Error ? error.message : "unknown"}`,
        },
        "failed",
        ops.contactId
      );
      await notifyDiscord("failed");
      return { ok: false, taskId: null };
    }
  }

  await logOutcome(
    {
      title,
      error: `No GHL contact and no ops fallback — direct student to ${SUPPORT_EMAIL}`,
    },
    "failed"
  );
  await notifyDiscord("failed");
  return { ok: false, taskId: null };
}
