import "server-only";
import { db } from "@/db";
import { betaFeedback, type BetaFeedbackCategory } from "@/db/schema";

export async function storeBetaFeedback(input: {
  userId: string;
  category: BetaFeedbackCategory;
  message: string;
  pagePath?: string | null;
  source?: "chatbot" | "chatbot_form";
}) {
  const [record] = await db
    .insert(betaFeedback)
    .values({
      userId: input.userId,
      category: input.category,
      message: input.message.trim(),
      pagePath: input.pagePath?.trim() || null,
      source: input.source ?? "chatbot",
    })
    .returning({ id: betaFeedback.id, createdAt: betaFeedback.createdAt });

  return record;
}
