import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRealUser } from "@/lib/auth";
import { storeBetaFeedback } from "@/lib/beta-feedback";
import {
  labAssistantLimiter,
  rateLimitResponse,
} from "@/lib/rate-limit";

const bodySchema = z.object({
  category: z.enum(["bug", "feature_request", "general"]),
  message: z.string().trim().min(5).max(4000),
  pagePath: z.string().trim().max(1000).optional(),
});

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

  try {
    const record = await storeBetaFeedback({
      userId: user.id,
      ...parsed.data,
      source: "chatbot_form",
    });
    return NextResponse.json(
      { id: record.id, reference: record.id.slice(0, 8) },
      { status: 201 },
    );
  } catch (error) {
    console.error("[Beta Feedback] Failed to store feedback:", error);
    return NextResponse.json(
      { error: "Feedback could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
