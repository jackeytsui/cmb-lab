import { auth } from "@clerk/nextjs/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { syncEvents } from "@/db/schema";
import { getRealUser } from "@/lib/auth";
import { logSyncEvent } from "@/lib/ghl/sync-logger";
import { createEscalationTask } from "@/lib/lab-assistant/escalation";
import {
  HANDOFF_RESPONSE_WINDOW,
  normalizeHandoffSummary,
} from "@/lib/lab-assistant/handoff-policy";
import { getStudentContext } from "@/lib/lab-assistant/student-context";
import {
  labAssistantLimiter,
  labAssistantLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";

const caseId = z.string().uuid();
const transcriptMessage = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().trim().min(1).max(4000),
});

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("resolved"), caseId }),
  z.object({
    action: z.literal("unresolved"),
    caseId,
    messages: z.array(transcriptMessage).min(1).max(30),
    pagePath: z.string().startsWith("/").max(1000).optional(),
  }),
  z.object({
    action: z.literal("rate"),
    caseId,
    rating: z.number().int().min(1).max(5),
  }),
]);

async function findCaseEvent(
  eventType: "lab_assistant.resolution" | "lab_assistant.csat",
  userId: string,
  targetCaseId: string,
) {
  const [event] = await db
    .select({ payload: syncEvents.payload })
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.eventType, eventType),
        eq(syncEvents.entityId, userId),
        sql`${syncEvents.payload}->>'caseId' = ${targetCaseId}`,
      ),
    )
    .orderBy(desc(syncEvents.createdAt))
    .limit(1);
  return (event?.payload as Record<string, unknown> | undefined) ?? null;
}

export async function POST(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const limiter = selectLimiter(
    user.role,
    labAssistantLimiter,
    labAssistantLimiterElevated,
  );
  const limit = await limiter.limit(`lab-resolution:${userId}`);
  if (!limit.success) return rateLimitResponse(limit);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existingDecision = await findCaseEvent(
    "lab_assistant.resolution",
    user.id,
    parsed.data.caseId,
  );

  if (parsed.data.action === "resolved") {
    if (existingDecision?.resolved === false) {
      return NextResponse.json(
        { error: "This case was already handed to support" },
        { status: 409 },
      );
    }
    if (!existingDecision) {
      await logSyncEvent({
        eventType: "lab_assistant.resolution",
        direction: "outbound",
        entityType: "lab_assistant",
        entityId: user.id,
        payload: { caseId: parsed.data.caseId, resolved: true },
      });
    }
    return NextResponse.json({ success: true, canRate: true });
  }

  if (parsed.data.action === "rate") {
    if (existingDecision?.resolved !== true) {
      return NextResponse.json(
        { error: "CSAT is only available for a confirmed resolution" },
        { status: 409 },
      );
    }
    const existingRating = await findCaseEvent(
      "lab_assistant.csat",
      user.id,
      parsed.data.caseId,
    );
    if (!existingRating) {
      await logSyncEvent({
        eventType: "lab_assistant.csat",
        direction: "outbound",
        entityType: "lab_assistant",
        entityId: user.id,
        payload: {
          caseId: parsed.data.caseId,
          rating: parsed.data.rating,
          resolved: true,
        },
      });
    }
    return NextResponse.json({ success: true });
  }

  if (existingDecision?.resolved === true) {
    return NextResponse.json(
      { error: "This case was already confirmed as resolved" },
      { status: 409 },
    );
  }
  if (
    existingDecision?.resolved === false &&
    existingDecision.taskCreated === true
  ) {
    return NextResponse.json({
      success: true,
      taskCreated: true,
      responseWindow: HANDOFF_RESPONSE_WINDOW,
    });
  }

  const messages = parsed.data.messages;
  const latestStudentText = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.text;
  const transcript = [
    ...messages.map(
      (message) =>
        `${message.role === "user" ? "Student" : "Assistant"}: ${message.text}`,
    ),
    ...(parsed.data.pagePath ? [`Page: ${parsed.data.pagePath}`] : []),
    "[Student marked the AI answer as not resolved.]",
  ].join("\n");
  const summary = normalizeHandoffSummary(
    latestStudentText
      ? `Student says the Lab Assistant did not resolve their question: ${latestStudentText}`
      : null,
    latestStudentText,
    "Student requested human follow-up from the resolution check.",
  );

  const studentContext = await getStudentContext(user);
  const handoff = await createEscalationTask({
    user,
    ghlContactId: studentContext.ghlContactId,
    intent: "student_marked_unresolved",
    confidence: null,
    summary,
    transcript,
    urgent: false,
  });

  await logSyncEvent({
    eventType: "lab_assistant.resolution",
    direction: "outbound",
    entityType: "lab_assistant",
    entityId: user.id,
    payload: {
      caseId: parsed.data.caseId,
      resolved: false,
      taskCreated: handoff.ok,
      taskId: handoff.taskId,
      discordNotified: handoff.discordNotified,
    },
    ...(handoff.ok ? {} : { status: "failed" as const }),
  });

  return NextResponse.json(
    {
      success: handoff.ok,
      taskCreated: handoff.ok,
      discordNotified: handoff.discordNotified,
      responseWindow: HANDOFF_RESPONSE_WINDOW,
    },
    { status: handoff.ok ? 200 : 502 },
  );
}
