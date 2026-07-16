// src/lib/lab-assistant/escalation.ts
// Handover layer: escalation and testimonial requests become GHL tasks on the
// student's own contact (single-contact scope enforced by student-context.ts).

import type { User } from "@/db/schema";
import { createContactTask } from "@/lib/ghl/tasks";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { SUPPORT_EMAIL } from "./allowlist";

const ESCALATION_DUE_HOURS = 24;
const URGENT_DUE_HOURS = 4; // same-day follow-up for urgent signals

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
  });
}

async function createHandoverTask(params: {
  user: User;
  ghlContactId: string | null;
  title: string;
  body: string;
  dueDate: Date;
  eventType: string;
}): Promise<HandoverResult> {
  const { user, ghlContactId, title, body, dueDate, eventType } = params;

  if (!ghlContactId) {
    // Student has no linked GHL contact — surface in the audit trail so the
    // team can fix the link; the bot falls back to the support email.
    await logSyncEvent({
      eventType,
      direction: "outbound",
      entityType: "lab_assistant",
      entityId: user.id,
      payload: {
        title,
        error: `No linked GHL contact — direct student to ${SUPPORT_EMAIL}`,
      },
      status: "failed",
    }).catch(() => {
      console.error("[Lab Assistant] Failed to log handover failure");
    });
    return { ok: false, taskId: null };
  }

  try {
    const taskId = await createContactTask(ghlContactId, {
      title,
      body,
      dueDate,
    });

    await logSyncEvent({
      eventType,
      direction: "outbound",
      entityType: "lab_assistant",
      entityId: user.id,
      ghlContactId,
      // Redacted analytics payload: no transcript / PII beyond the task link.
      payload: { title, taskId, dueDate: dueDate.toISOString() },
    }).catch(() => {
      console.error("[Lab Assistant] Failed to log handover event");
    });

    return { ok: true, taskId };
  } catch (error) {
    console.error(
      "[Lab Assistant] Handover task creation failed:",
      error instanceof Error ? error.message : error
    );
    return { ok: false, taskId: null };
  }
}
