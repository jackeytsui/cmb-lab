import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { storeBetaFeedback } from "@/lib/beta-feedback";
import { getStudentContext } from "@/lib/lab-assistant/student-context";
import { createFeedbackTask } from "@/lib/lab-assistant/escalation";
import {
  HANDOFF_RESPONSE_WINDOW,
  normalizeHandoffSummary,
} from "@/lib/lab-assistant/handoff-policy";
import { SUPPORT_EMAIL } from "@/lib/lab-assistant/allowlist";
import {
  labAssistantLimiter,
  rateLimitResponse,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  category: z.enum(["bug", "feature_request", "general"]),
  message: z.string().trim().min(5).max(4000),
  pagePath: z.string().trim().max(1000).optional(),
});

const CATEGORY_LABELS = {
  bug: "Bug report",
  feature_request: "Feature request",
  general: "Product feedback",
} as const;

export async function POST(request: NextRequest) {
  const user = await getRealUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await labAssistantLimiter.limit(`beta-feedback:${user.id}`);
  if (!rl.success) return rateLimitResponse(rl);

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please include at least a few words about your feedback." },
      { status: 400 },
    );
  }

  let record: Awaited<ReturnType<typeof storeBetaFeedback>>;
  try {
    record = await storeBetaFeedback({
      userId: user.id,
      ...parsed.data,
      source: "chatbot_form",
    });
  } catch (error) {
    console.error("[Beta Feedback] Failed to store feedback:", error);
    return NextResponse.json(
      { error: "Feedback could not be saved. Please try again." },
      { status: 500 },
    );
  }

  let taskCreated = false;
  try {
    const studentContext = await getStudentContext(user);
    const label = CATEGORY_LABELS[parsed.data.category];
    const handoff = await createFeedbackTask({
      user,
      ghlContactId: studentContext.ghlContactId,
      category: parsed.data.category,
      message: parsed.data.message,
      pagePath: parsed.data.pagePath,
      reference: record.id.slice(0, 8),
      summary: normalizeHandoffSummary(
        `${label}: ${parsed.data.message}`,
        parsed.data.message,
      ),
    });
    taskCreated = handoff.ok;
  } catch (error) {
    console.error("[Beta Feedback] Failed to create support task:", error);
  }

  return NextResponse.json(
    {
      id: record.id,
      reference: record.id.slice(0, 8),
      taskCreated,
      responseWindow: HANDOFF_RESPONSE_WINDOW,
      ...(!taskCreated
        ? {
            warning: `Your feedback was saved, but we couldn't create the support task. Please email ${SUPPORT_EMAIL}.`,
            supportEmail: SUPPORT_EMAIL,
          }
        : {}),
    },
    { status: 201 },
  );
}
