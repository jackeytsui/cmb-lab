// src/app/api/lab-assistant/route.ts
// CMB Lab Assistant chat endpoint. Gorgias-style pipeline:
//   identify (session) → intent scan → guidance → resolve or escalate.
//
// Data gatekeeping: the model never calls GHL. getStudentContext() injects
// the allowlisted fields for the signed-in student only; the model's single
// tool (escalateToTeam) writes a task through the same middleware.

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateObject,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getRealUser, hasMinimumRole } from "@/lib/auth";
import {
  labAssistantLimiter,
  labAssistantLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import {
  INTENT_CONFIDENCE_THRESHOLD,
  LAB_ASSISTANT_INTENTS,
  SUPPORT_EMAIL,
  type LabAssistantIntent,
} from "@/lib/lab-assistant/allowlist";
import { getStudentContext } from "@/lib/lab-assistant/student-context";
import {
  createEscalationTask,
  createTestimonialTask,
} from "@/lib/lab-assistant/escalation";
import {
  getGuidancePrompt,
  getIntentTalkTrack,
  renderStudentContext,
} from "@/lib/lab-assistant/guidance";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import type { User } from "@/db/schema";

export const maxDuration = 30;

const ESCALATION_CONFIRMATION = `I've passed this to the team — they'll get back to you within 1 business day. If it's urgent, email ${SUPPORT_EMAIL} and we'll prioritise it.`;

const ALREADY_ESCALATED_REPLY = `The team already has your request and will reply within 1 business day. If it's urgent, email ${SUPPORT_EMAIL}.`;

const ESCALATION_FALLBACK_REPLY = `I couldn't reach the team's system just now — please email ${SUPPORT_EMAIL} directly and they'll take care of you.`;

const intentSchema = z.object({
  intent: z
    .enum(LAB_ASSISTANT_INTENTS)
    .describe("Best-matching launch-scope intent for the student's latest message"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("How confident you are in the intent classification"),
  urgent: z
    .boolean()
    .describe(
      "True if the student signals urgency, distress, or a time-critical problem"
    ),
});

type IntentScan = z.infer<typeof intentSchema>;

/** Extract plain text from a UI message's parts. */
function messageText(message: UIMessage): string {
  return message.parts
    .filter(
      (part): part is Extract<typeof part, { type: "text" }> =>
        part.type === "text"
    )
    .map((part) => part.text)
    .join(" ")
    .trim();
}

/** Full transcript for GHL task bodies (student-facing text only). */
function buildTranscript(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const text = messageText(message);
      if (!text) return null;
      return `${message.role === "user" ? "Student" : "Assistant"}: ${text}`;
    })
    .filter(Boolean)
    .join("\n");
}

/** True once this conversation has already produced an escalation task. */
function alreadyEscalated(messages: UIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      messageText(message).includes("passed this to the team")
  );
}

/**
 * Intent scan (pipeline step 2). Cheap classifier over the recent exchange.
 * On classifier failure returns null → treated as unresolved → escalate,
 * never guess.
 */
async function scanIntent(messages: UIMessage[]): Promise<IntentScan | null> {
  const recent = messages
    .slice(-6)
    .map((message) => {
      const text = messageText(message);
      return text
        ? `${message.role === "user" ? "Student" : "Assistant"}: ${text}`
        : null;
    })
    .filter(Boolean)
    .join("\n");

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: intentSchema,
      system: `You classify support messages for CMB Lab (a language-learning program). Classify the STUDENT'S LATEST message given the conversation.

Intents:
- start_date: asking when their program/cohort starts
- end_date: asking when their program/access ends
- my_coach: asking who their coach is / coach assignment
- referral: asking about the referral program or their own referral status
- testimonial_sheldon: wants to do a testimonial/interview/review with Sheldon
- smalltalk: greetings, thanks, pleasantries, "ok great" — nothing to resolve
- other: anything else (payments, bugs, lesson content, another person's data, unclear requests)

Set urgent=true only for genuine urgency or distress signals.`,
      prompt: recent || "Student: (empty message)",
    });
    return object;
  } catch (error) {
    console.error(
      "[Lab Assistant] Intent scan failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

/** Redacted analytics event for every classified message (no message text). */
function logIntentScan(user: User, scan: IntentScan | null, resolved: boolean) {
  logSyncEvent({
    eventType: "lab_assistant.intent_scan",
    direction: "outbound",
    entityType: "lab_assistant",
    entityId: user.id,
    payload: {
      intent: scan?.intent ?? "unclassified",
      confidence: scan?.confidence ?? null,
      urgent: scan?.urgent ?? false,
      resolved,
    },
  }).catch(() => {
    console.error("[Lab Assistant] Failed to log intent scan");
  });
}

/** Stream a fixed reply in the UI message protocol (no model call). */
function cannedResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = "lab-assistant-canned";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limiting (per Clerk user)
  const role =
    ((sessionClaims?.metadata as Record<string, unknown>)?.role as string) ||
    "student";
  const limiter = selectLimiter(
    role,
    labAssistantLimiter,
    labAssistantLimiterElevated
  );
  const rl = await limiter.limit(`lab:${userId}`);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  // Identify: always the real session user (never impersonation, never
  // identity claims from chat).
  const user = await getRealUser();
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const messages: UIMessage[] = Array.isArray(body.messages)
      ? body.messages
      : [];
    if (messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    // Dry run (admin test console): full pipeline, but no GHL tasks are
    // created and intent scans stay out of the resolution metrics.
    // Only honored for coach/admin so students can't suppress escalation.
    const dryRun = body.dryRun === true && (await hasMinimumRole("coach"));

    const transcript = buildTranscript(messages);

    // Pipeline: intent scan + gatekept context (independent, run together)
    const [scan, studentContext] = await Promise.all([
      scanIntent(messages),
      getStudentContext(user),
    ]);

    const confident =
      scan !== null && scan.confidence >= INTENT_CONFIDENCE_THRESHOLD;
    const intent: LabAssistantIntent | null = confident ? scan.intent : null;
    const urgent = scan?.urgent ?? false;

    // Unresolved (off-scope, unclear, or low confidence) → escalate, don't guess.
    if (intent === null || intent === "other") {
      if (!dryRun) logIntentScan(user, scan, false);

      if (alreadyEscalated(messages)) {
        return cannedResponse(ALREADY_ESCALATED_REPLY);
      }

      const result = dryRun
        ? { ok: true, taskId: null }
        : await createEscalationTask({
            user,
            ghlContactId: studentContext.ghlContactId,
            intent: scan && intent === "other" ? "other" : null,
            confidence: scan?.confidence ?? null,
            transcript,
            urgent,
          });

      return cannedResponse(
        result.ok ? ESCALATION_CONFIRMATION : ESCALATION_FALLBACK_REPLY
      );
    }

    if (!dryRun) logIntentScan(user, scan, true);

    // Intent 5: always create the testimonial task, then confirm.
    let testimonialNote = "";
    if (intent === "testimonial_sheldon") {
      const result = dryRun
        ? { ok: true, taskId: null }
        : await createTestimonialTask({
            user,
            ghlContactId: studentContext.ghlContactId,
            transcript,
          });
      testimonialNote = result.ok
        ? `\n\nSERVER NOTE: A "Testimonial interview request" task was just created for the team. Confirm warmly to the student that their testimonial interview with Sheldon has been requested and the team will reach out to schedule it. Do not create any further escalation.`
        : `\n\nSERVER NOTE: Creating the testimonial request failed. Apologise briefly and ask the student to email ${SUPPORT_EMAIL} to set up their testimonial interview with Sheldon.`;
    }

    // Urgent in-scope message: task now, and the model points to the inbox.
    let urgentNote = "";
    if (urgent && intent !== "testimonial_sheldon") {
      const result = dryRun
        ? { ok: true, taskId: null }
        : await createEscalationTask({
            user,
            ghlContactId: studentContext.ghlContactId,
            intent,
            confidence: scan?.confidence ?? null,
            transcript,
            urgent: true,
          });
      urgentNote = result.ok
        ? `\n\nSERVER NOTE: This message was flagged urgent — a same-day task was already created for the team. Answer the question if you can, mention the team has been notified, and point the student to ${SUPPORT_EMAIL} for anything time-critical. Do not call escalateToTeam again.`
        : `\n\nSERVER NOTE: This message was flagged urgent but the team task could not be created. Point the student to ${SUPPORT_EMAIL} directly.`;
    }

    // Guidance layer: team-editable prompt + allowlisted context only,
    // plus the team-authored talk track for the detected intent (if any).
    const [guidance, talkTrack] = await Promise.all([
      getGuidancePrompt(),
      getIntentTalkTrack(intent),
    ]);
    const talkTrackNote = talkTrack
      ? `\n\nTALK TRACK FOR THIS INTENT (team-authored — follow it closely, adapting naturally to the conversation):\n${talkTrack}`
      : "";
    const systemPrompt =
      guidance +
      "\n" +
      renderStudentContext(studentContext) +
      `\n\nDetected intent for the latest message: ${intent}` +
      talkTrackNote +
      testimonialNote +
      urgentNote;

    const result = streamText({
      model: openai("gpt-4o"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages.slice(-20)),
      tools: {
        escalateToTeam: {
          description:
            "Hand the conversation to the human team by creating a follow-up task. Use when the request is outside your 5 supported topics, when the student asks for a human, when they accept your offer to loop in the team, or when something is urgent.",
          inputSchema: z.object({
            reason: z
              .string()
              .describe("One line on why this needs the team"),
            urgent: z
              .boolean()
              .describe("True if the student needs same-day follow-up"),
          }),
          execute: async ({ reason, urgent: toolUrgent }) => {
            const escalation = dryRun
              ? { ok: true, taskId: null }
              : await createEscalationTask({
                  user,
                  ghlContactId: studentContext.ghlContactId,
                  intent,
                  confidence: scan?.confidence ?? null,
                  transcript: `${transcript}\n\n[Bot escalation reason: ${reason}]`,
                  urgent: toolUrgent || urgent,
                });
            return escalation.ok
              ? {
                  ok: true,
                  message:
                    "Task created. Tell the student it's been passed to the team and they'll hear back within 1 business day; urgent issues should go to " +
                    SUPPORT_EMAIL +
                    ".",
                }
              : {
                  ok: false,
                  message:
                    "Task creation failed. Ask the student to email " +
                    SUPPORT_EMAIL +
                    " directly.",
                };
          },
        },
      },
      stopWhen: stepCountIs(3),
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[Lab Assistant] API error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
