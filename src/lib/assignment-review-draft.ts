import { z } from "zod";

const correctionDraftSchema = z.object({
  id: z.string().min(1).max(100),
  operation: z.enum(["replace", "delete", "insert"]),
  startOffset: z.number().int().min(0),
  endOffset: z.number().int().min(0),
  originalText: z.string().max(2000),
  suggestedChinese: z.string().max(2000),
  suggestedPinyin: z.string().max(4000),
  suggestedEnglish: z.string().max(4000),
});

export const textAssignmentReviewDraftSchema = z.object({
  version: z.literal(1),
  kind: z.literal("text_assignment"),
  sentences: z
    .array(
      z.object({
        sentenceId: z.string().uuid(),
        verdict: z.enum(["correct", "needs_correction"]),
        corrections: z.array(correctionDraftSchema).max(50),
      }),
    )
    .min(1)
    .max(50),
  // Keep the raw input so an in-progress value can be restored exactly.
  overrideInput: z.string().max(10),
  extraComment: z.string().max(20000),
  recordingUrl: z.string().max(2000),
});

const vocalHackCorrectionDraftSchema = z.object({
  chinese: z.string().max(2000),
  pinyin: z.string().max(4000),
  english: z.string().max(4000),
});

export const vocalHackReviewDraftSchema = z.object({
  version: z.literal(1),
  kind: z.literal("vocal_hack"),
  sentences: z
    .array(
      z.object({
        sentenceId: z.string().uuid(),
        // Empty entries are intentional: they preserve text while it is typed.
        corrections: z.array(vocalHackCorrectionDraftSchema).max(20),
      }),
    )
    .min(1)
    .max(50),
  extraComment: z.string().max(20000),
  recordingUrl: z.string().max(2000),
});

export const assignmentReviewDraftSchema = z.discriminatedUnion("kind", [
  textAssignmentReviewDraftSchema,
  vocalHackReviewDraftSchema,
]);

export type AssignmentReviewDraft = z.infer<typeof assignmentReviewDraftSchema>;
export type TextAssignmentReviewDraft = z.infer<
  typeof textAssignmentReviewDraftSchema
>;
export type VocalHackReviewDraft = z.infer<typeof vocalHackReviewDraftSchema>;

/**
 * Parse a stored/requested draft and ensure it belongs to this submission and
 * covers each sentence exactly once. Invalid or stale drafts are ignored.
 */
export function parseAssignmentReviewDraft(
  value: unknown,
  assignmentType: string,
  sentenceIds: string[],
): AssignmentReviewDraft | null {
  const parsed = assignmentReviewDraftSchema.safeParse(value);
  if (!parsed.success) return null;

  const expectedKind =
    assignmentType === "vocal_hack" ? "vocal_hack" : "text_assignment";
  if (parsed.data.kind !== expectedKind) return null;

  const expectedIds = new Set(sentenceIds);
  const actualIds = new Set(
    parsed.data.sentences.map((sentence) => sentence.sentenceId),
  );
  if (
    actualIds.size !== parsed.data.sentences.length ||
    actualIds.size !== expectedIds.size ||
    ![...actualIds].every((id) => expectedIds.has(id))
  ) {
    return null;
  }

  return parsed.data;
}
