// src/app/api/lab-assistant/route.ts
// CMB Lab Assistant chat endpoint. Gorgias-style pipeline:
//   identify (session) → intent scan → guidance → resolve or escalate.
//
// Data gatekeeping: student mode never calls GHL directly. Internal recording
// mode is available only to server-verified admins, coaches, and consultants.

import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateText,
  Output,
  stepCountIs,
  streamText,
  type FinishReason,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getRealUser } from "@/lib/auth";
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
  createFeedbackTask,
  createTestimonialTask,
} from "@/lib/lab-assistant/escalation";
import {
  getGuidancePrompt,
  getIntentTalkTrack,
  renderStudentContext,
} from "@/lib/lab-assistant/guidance";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import type { User } from "@/db/schema";
import { isPromptInjectionProbe } from "@/lib/lab-assistant/safety";
import {
  coachAssignmentReply,
  isDirectCoachLookup,
} from "@/lib/lab-assistant/coach-context";
import { searchKnowledgeBase } from "@/lib/chat-utils";
import { storeBetaFeedback } from "@/lib/beta-feedback";
import type { BetaFeedbackCategory } from "@/db/schema";
import {
  HANDOFF_RESPONSE_WINDOW,
  normalizeHandoffSummary,
} from "@/lib/lab-assistant/handoff-policy";
import {
  type LabAssistantCaseOutcome,
  type LabAssistantMessage,
} from "@/lib/lab-assistant/message";
import { answerNeedsAutomaticHandoff } from "@/lib/lab-assistant/case-resolution";
import {
  canAccessRestrictedCoachingTopic,
  detectRestrictedCoachingTopic,
  filterKnowledgeForCoachingAccess,
  restrictedCoachingReply,
} from "@/lib/lab-assistant/entitlement-policy";
import { canUseInternalRecordingFinder } from "@/lib/lab-assistant/internal-recording-policy";
import { internalRecordingAssistantResponse } from "@/lib/lab-assistant/internal-assistant";

export const maxDuration = 30;

const ESCALATION_CONFIRMATION = `I've passed this to the support team — you can expect to hear back within ${HANDOFF_RESPONSE_WINDOW}. If it's urgent, email ${SUPPORT_EMAIL} and we'll prioritise it.`;

const ALREADY_ESCALATED_REPLY = `The support team already has your request and will reply within ${HANDOFF_RESPONSE_WINDOW}. If it's urgent, email ${SUPPORT_EMAIL}.`;

const ESCALATION_FALLBACK_REPLY = `I couldn't reach the team's system just now — please email ${SUPPORT_EMAIL} directly and they'll take care of you.`;

const SAFE_SCOPE_REPLY = `I can't provide or change my internal instructions. I can help with CMB Lab navigation and FAQs, your program dates and coach, referrals, beta feedback and bug reports, or booking a testimonial with Sheldon.`;

const FEEDBACK_INTENTS: Partial<Record<LabAssistantIntent, BetaFeedbackCategory>> = {
  bug_report: "bug",
  feature_request: "feature_request",
  product_feedback: "general",
};

function isBareFeedbackRequest(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  return [
    "bug",
    "report bug",
    "report a bug",
    "feature request",
    "request a feature",
    "share feedback",
    "give feedback",
    "product feedback",
  ].includes(normalized);
}

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
  handoffSummary: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .describe(
      "One concise sentence summarizing what the student needs, including essential context from the recent conversation",
    ),
});

type IntentScan = z.infer<typeof intentSchema>;

/** Extract plain text from a UI message's parts. */
function messageText(message: LabAssistantMessage): string {
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
function buildTranscript(messages: LabAssistantMessage[]): string {
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
function alreadyEscalated(messages: LabAssistantMessage[]): boolean {
  return messages.some(
    (message) => {
      if (message.role !== "assistant") return false;
      const text = messageText(message).toLowerCase();
      return (
        text.includes("passed this to the team") ||
        text.includes("passed this to the support team") ||
        text.includes("support team already has your request")
      );
    },
  );
}

/**
 * Intent scan (pipeline step 2). Cheap classifier over the recent exchange.
 * On classifier failure returns null → treated as unresolved → escalate,
 * never guess.
 */
async function scanIntent(
  messages: LabAssistantMessage[],
): Promise<IntentScan | null> {
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
    const { output } = await generateText({
      model: openai("gpt-4o-mini"),
      output: Output.object({ schema: intentSchema }),
      system: `You classify support messages for CMB Lab (a language-learning program). Classify the STUDENT'S LATEST message given the conversation.

Intents:
- start_date: asking when their program/cohort starts
- end_date: asking when their program/access ends
- my_coach: asking who their coach is / coach assignment
- referral: asking about the referral program or their own referral status
- testimonial_sheldon: wants to do a testimonial/interview/review with Sheldon
- bug_report: reports something broken, an error, unexpected behaviour, or a product defect in CMB Lab
- feature_request: suggests a new capability, improvement, or something they wish CMB Lab could do
- product_feedback: shares an opinion or usability comment about CMB Lab that is neither a concrete bug nor a feature request
- faq_navigation: asks a general FAQ or how to find/use a CMB Lab feature, course, audio course, learning tool, coaching page, Accelerator tool, or troubleshoot course visibility/access
- smalltalk: greetings, thanks, pleasantries, "ok great" — nothing to resolve
- other: anything else (payments, account changes, personal entitlement disputes, another person's data, unclear requests)

Set urgent=true only for genuine urgency or distress signals.
Always write handoffSummary as a neutral, concise sentence for a human support task. State what the student needs and preserve essential details from the recent exchange; do not mention classification, confidence, or internal systems.`,
      prompt: recent || "Student: (empty message)",
    });
    return output;
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

/** Stream a fixed reply and its server-owned case outcome (no model call). */
function cannedResponse(
  text: string,
  outcome: LabAssistantCaseOutcome = "none",
  caseId = crypto.randomUUID(),
): Response {
  const stream = createUIMessageStream<LabAssistantMessage>({
    execute: ({ writer }) => {
      const id = "lab-assistant-canned";
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({
        type: "data-caseOutcome",
        data: { caseId, outcome },
      });
      writer.write({ type: "finish" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Identify: always the real session user (never impersonation, never
  // identity claims from chat).
  const user = await getRealUser();
  if (!user) {
    return Response.json({ error: "User not found" }, { status: 401 });
  }

  let fallbackMessages: LabAssistantMessage[] = [];
  let fallbackDryRun = false;

  try {
    const body = await request.json();
    const messages: LabAssistantMessage[] = Array.isArray(body.messages)
      ? body.messages
      : [];
    fallbackMessages = messages;
    if (messages.length === 0) {
      return Response.json({ error: "No messages provided" }, { status: 400 });
    }

    // Dry run (admin test console): full pipeline, but no GHL tasks are
    // created and intent scans stay out of the resolution metrics.
    // Only honored for coach/admin so students can't suppress escalation.
    const verifiedRole = user.role;
    const dryRun =
      body.dryRun === true &&
      (verifiedRole === "coach" || verifiedRole === "admin");
    fallbackDryRun = dryRun;

    // Admin QA traffic gets its own per-user bucket. Intensive dry-run tests
    // must not consume or inherit the quota used by the real support widget.
    const limiter = selectLimiter(
      verifiedRole,
      labAssistantLimiter,
      labAssistantLimiterElevated,
    );
    const rl = await limiter.limit(
      `${dryRun ? "lab-test" : "lab"}:${userId}`,
    );
    if (!rl.success) {
      return rateLimitResponse(rl);
    }

    const transcript = buildTranscript(messages);
    const latestUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === "user");
    const latestUserText = latestUserMessage ? messageText(latestUserMessage) : "";
    const pagePath =
      typeof body.pagePath === "string" &&
      body.pagePath.startsWith("/") &&
      body.pagePath.length <= 1000
        ? body.pagePath
        : null;

    // Prompt-injection probes are neither support requests nor reasons to
    // create a GHL handover. Handle them deterministically before the intent
    // classifier so an "other" classification cannot generate task noise.
    if (
      latestUserMessage &&
      isPromptInjectionProbe(messageText(latestUserMessage))
    ) {
      return cannedResponse(SAFE_SCOPE_REPLY);
    }

    // The signed-in internal team gets a purpose-built recording finder.
    // Admin dry runs deliberately stay in the student pipeline so the
    // existing QA console continues to test the student experience.
    if (!dryRun && canUseInternalRecordingFinder(verifiedRole)) {
      return internalRecordingAssistantResponse(messages, user);
    }

    const studentContextPromise = getStudentContext(user);
    const restrictedCoachingTopic = detectRestrictedCoachingTopic(
      messages.map(messageText).filter(Boolean),
    );

    // Private coaching access is decided before intent classification, RAG,
    // or answer generation. A missing entitlement fails closed, so neither
    // the model nor published knowledge content can disclose a join link.
    if (restrictedCoachingTopic) {
      const studentContext = await studentContextPromise;
      if (
        !canAccessRestrictedCoachingTopic(
          studentContext.coachingAccess,
          restrictedCoachingTopic,
        )
      ) {
        if (!dryRun) {
          logIntentScan(
            user,
            {
              intent: "faq_navigation",
              confidence: 1,
              urgent: false,
              handoffSummary:
                "Student asked about a private coaching feature that is not included in their verified access.",
            },
            true,
          );
        }
        return cannedResponse(
          restrictedCoachingReply(restrictedCoachingTopic),
          "awaiting_confirmation",
        );
      }
    }

    // Direct coach-assignment questions use the server-verified CMB Lab
    // assignment and a deterministic reply. This keeps the most common coach
    // question correct even if the intent model is unavailable or GHL has a
    // stale Coach Name field.
    if (isDirectCoachLookup(latestUserText)) {
      const studentContext = await studentContextPromise;
      const coachScan: IntentScan = {
        intent: "my_coach",
        confidence: 1,
        urgent: false,
        handoffSummary: "Student is asking who their assigned coach is.",
      };
      if (!dryRun) {
        logIntentScan(
          user,
          coachScan,
          studentContext.coach.status !== "unavailable",
        );
      }
      if (studentContext.coach.status === "unavailable") {
        const result = dryRun
          ? { ok: true, taskId: null }
          : await createEscalationTask({
              user,
              ghlContactId: studentContext.ghlContactId,
              intent: "my_coach",
              confidence: 1,
              summary:
                "Student asked who their coach is, but the verified assignment could not be read.",
              transcript,
              urgent: false,
            });
        return cannedResponse(
          result.ok ? ESCALATION_CONFIRMATION : ESCALATION_FALLBACK_REPLY,
          result.ok ? "handoff_created" : "handoff_failed",
        );
      }
      return cannedResponse(
        coachAssignmentReply(studentContext.coach, latestUserText),
        "awaiting_confirmation",
      );
    }

    // Pipeline: intent scan + gatekept context (independent, run together)
    const [scan, studentContext] = await Promise.all([
      scanIntent(messages),
      studentContextPromise,
    ]);

    const confident =
      scan !== null && scan.confidence >= INTENT_CONFIDENCE_THRESHOLD;
    const intent: LabAssistantIntent | null = confident ? scan.intent : null;
    const urgent = scan?.urgent ?? false;
    const handoffSummary = normalizeHandoffSummary(
      scan?.handoffSummary,
      latestUserText,
    );

    // Product feedback is stored in CMB Lab for history and also routed into
    // the same assigned GHL + Discord handoff flow as unanswered chats.
    // Bare quick-action phrases ask for detail before anything is created.
    const feedbackCategory = intent ? FEEDBACK_INTENTS[intent] : undefined;
    if (feedbackCategory) {
      if (!dryRun) logIntentScan(user, scan, true);
      if (isBareFeedbackRequest(latestUserText)) {
        const prompt =
          feedbackCategory === "bug"
            ? "Tell me what happened, what you expected, and which page you were on. I’ll create a support task for the team."
            : feedbackCategory === "feature_request"
              ? "What would you like CMB Lab to do, and how would it help you? I’ll create a support task for the team."
              : "What would you like us to know about your CMB Lab experience? I’ll create a support task for the team.";
        return cannedResponse(prompt);
      }

      if (dryRun) {
        return cannedResponse(
          "Dry run: this feedback would be saved and sent to the support team as an assigned GHL task.",
          "none",
        );
      }

      let record: Awaited<ReturnType<typeof storeBetaFeedback>>;
      try {
        record = await storeBetaFeedback({
          userId: user.id,
          category: feedbackCategory,
          message: latestUserText,
          pagePath,
          source: "chatbot",
        });
      } catch (error) {
        console.error("[Lab Assistant] Feedback capture failed:", error);
        return cannedResponse(
          `I couldn't save that just now. Please try again, or email ${SUPPORT_EMAIL} if the issue is blocking you.`,
          "handoff_failed",
        );
      }

      const reference = record.id.slice(0, 8);
      const label =
        feedbackCategory === "bug"
          ? "bug report"
          : feedbackCategory === "feature_request"
            ? "feature request"
            : "feedback";
      try {
        const handoff = await createFeedbackTask({
          user,
          ghlContactId: studentContext.ghlContactId,
          category: feedbackCategory,
          message: latestUserText,
          pagePath,
          reference,
          summary: handoffSummary,
          transcript,
        });

        if (!handoff.ok) {
          return cannedResponse(
            `Your ${label} was saved with reference ${reference}, but I couldn't create the support task. Please email ${SUPPORT_EMAIL} so the team doesn't miss it.`,
            "handoff_failed",
          );
        }
        return cannedResponse(
          `Thanks — your ${label} is saved and has been sent to the support team as a task. Expect to hear back within ${HANDOFF_RESPONSE_WINDOW}. Reference: ${reference}.`,
          "handoff_created",
        );
      } catch (error) {
        console.error("[Lab Assistant] Feedback task creation failed:", error);
        return cannedResponse(
          `Your ${label} was saved with reference ${reference}, but I couldn't create the support task. Please email ${SUPPORT_EMAIL} so the team doesn't miss it.`,
          "handoff_failed",
        );
      }
    }

    // Unresolved (off-scope, unclear, or low confidence) → escalate, don't guess.
    if (intent === null || intent === "other") {
      if (!dryRun) logIntentScan(user, scan, false);

      if (alreadyEscalated(messages)) {
        return cannedResponse(ALREADY_ESCALATED_REPLY, "handoff_created");
      }

      const result = dryRun
        ? { ok: true, taskId: null }
        : await createEscalationTask({
            user,
            ghlContactId: studentContext.ghlContactId,
            intent: scan && intent === "other" ? "other" : null,
            confidence: scan?.confidence ?? null,
            summary: handoffSummary,
            transcript,
            urgent,
          });

      return cannedResponse(
        result.ok ? ESCALATION_CONFIRMATION : ESCALATION_FALLBACK_REPLY,
        result.ok ? "handoff_created" : "handoff_failed",
      );
    }

    if (!dryRun) logIntentScan(user, scan, true);

    // Server-owned outcome state is attached to the response after all model
    // tools finish. The client never guesses resolution from response text.
    let handoffOutcome: "none" | "created" | "failed" = "none";

    // Intent 5: always create the testimonial task, then confirm.
    let testimonialNote = "";
    if (intent === "testimonial_sheldon") {
      const result = dryRun
        ? { ok: true, taskId: null }
        : await createTestimonialTask({
            user,
            ghlContactId: studentContext.ghlContactId,
            summary: handoffSummary,
            transcript,
          });
      handoffOutcome = result.ok ? "created" : "failed";
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
            summary: handoffSummary,
            transcript,
            urgent: true,
          });
      handoffOutcome = result.ok ? "created" : "failed";
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
      urgentNote +
      `\n\nRESOLUTION SAFETY RULE: Only finish with an answer when it is fully supported by the verified student context, the team-authored talk track, or a successful knowledge-base search. If information is missing, uncertain, unsupported, or the student asks for a human, you MUST call escalateToTeam before finishing. Never merely tell the student to contact support without creating the task.`;

    const modelMessages = await convertToModelMessages(messages.slice(-20));
    const caseId = crypto.randomUUID();
    const responseStream = createUIMessageStream<LabAssistantMessage>({
      execute: async ({ writer }) => {
        const result = streamText({
          model: openai("gpt-4o"),
          system: systemPrompt,
          messages: modelMessages,
          tools: {
            searchKnowledgeBase: {
              description:
                "Search published CMB Lab guidance for platform navigation, courses, access rules, learning tools, coaching, and FAQs. Use this before answering faq_navigation questions.",
              inputSchema: z.object({
                query: z
                  .string()
                  .describe(
                    "A short search phrase using the student's key topic",
                  ),
              }),
              execute: async ({ query }) =>
                filterKnowledgeForCoachingAccess(
                  await searchKnowledgeBase(query),
                  studentContext.coachingAccess,
                ),
            },
            escalateToTeam: {
              description:
                "Hand the conversation to the human team by creating a follow-up task. Use for missing or uncertain information, account-specific access problems, billing, security, unsupported requests, requests for a human, or urgent issues.",
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
                      summary: normalizeHandoffSummary(
                        scan?.handoffSummary,
                        latestUserText,
                        reason,
                      ),
                      transcript: `${transcript}\n\n[Bot escalation reason: ${reason}]`,
                      urgent: toolUrgent || urgent,
                    });
                handoffOutcome = escalation.ok ? "created" : "failed";
                return escalation.ok
                  ? {
                      ok: true,
                      message:
                        `Task created. Tell the student it's been passed to the support team and they'll hear back within ${HANDOFF_RESPONSE_WINDOW}; urgent issues should go to ` +
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

        // Hold the protocol finish until the final answer has passed the
        // fail-safe. Model stream errors and incomplete answers are converted
        // into a human task before the case outcome reaches the client.
        writer.merge(result.toUIMessageStream({ sendFinish: false }));

        let finalText = "";
        let finishReason: FinishReason = "other";
        try {
          [finalText, finishReason] = await Promise.all([
            result.text,
            result.finishReason,
          ]);
        } catch (error) {
          console.error(
            "[Lab Assistant] Model stream failed:",
            error instanceof Error ? error.message : error,
          );
        }

        if (
          handoffOutcome === "none" &&
          intent !== "smalltalk" &&
          answerNeedsAutomaticHandoff(finalText, finishReason)
        ) {
          const reason = finalText.trim()
            ? "The AI answer was incomplete or explicitly uncertain."
            : "The AI did not produce a complete answer.";
          const escalation = dryRun
            ? { ok: true, taskId: null }
            : await createEscalationTask({
                user,
                ghlContactId: studentContext.ghlContactId,
                intent,
                confidence: scan?.confidence ?? null,
                summary: normalizeHandoffSummary(
                  scan?.handoffSummary,
                  latestUserText,
                  reason,
                ),
                transcript: [
                  transcript,
                  ...(finalText.trim()
                    ? [`Assistant: ${finalText.trim()}`]
                    : []),
                  `[Automatic handoff reason: ${reason}]`,
                ].join("\n"),
                urgent,
              });
          handoffOutcome = escalation.ok ? "created" : "failed";
        }

        const outcome: LabAssistantCaseOutcome =
          handoffOutcome === "created"
            ? "handoff_created"
            : handoffOutcome === "failed"
              ? "handoff_failed"
              : intent === "smalltalk"
                ? "none"
                : "awaiting_confirmation";

        if (!dryRun) {
          await logSyncEvent({
            eventType: "lab_assistant.case_outcome",
            direction: "outbound",
            entityType: "lab_assistant",
            entityId: user.id,
            payload: { caseId, outcome, intent },
          }).catch(() => {
            console.error("[Lab Assistant] Failed to log case outcome");
          });
        }

        writer.write({
          type: "data-caseOutcome",
          data: { caseId, outcome },
        });
        writer.write({ type: "finish", finishReason });
      },
    });

    return createUIMessageStreamResponse({ stream: responseStream });
  } catch (error) {
    console.error("[Lab Assistant] API error:", error);
    const latestUserMessage = [...fallbackMessages]
      .reverse()
      .find((message) => message.role === "user");
    const latestUserText = latestUserMessage
      ? messageText(latestUserMessage)
      : "";

    // A server/model setup failure after a valid student message is itself an
    // unanswered case. Attempt the normal GHL + Discord handoff instead of
    // returning a dead-end error that somebody has to notice manually.
    if (latestUserText && !fallbackDryRun) {
      try {
        const studentContext = await getStudentContext(user);
        const transcript = buildTranscript(fallbackMessages);
        const handoff = alreadyEscalated(fallbackMessages)
          ? { ok: true, taskId: null }
          : await createEscalationTask({
              user,
              ghlContactId: studentContext.ghlContactId,
              intent: null,
              confidence: null,
              summary: normalizeHandoffSummary(
                null,
                latestUserText,
                "The Lab Assistant encountered an internal error before it could answer.",
              ),
              transcript: `${transcript}\n[Automatic handoff reason: assistant internal error]`,
              urgent: false,
            });
        return cannedResponse(
          handoff.ok ? ESCALATION_CONFIRMATION : ESCALATION_FALLBACK_REPLY,
          handoff.ok ? "handoff_created" : "handoff_failed",
        );
      } catch (handoffError) {
        console.error("[Lab Assistant] Error fallback handoff failed:", handoffError);
        return cannedResponse(ESCALATION_FALLBACK_REPLY, "handoff_failed");
      }
    }
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
