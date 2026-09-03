import { describe, expect, it } from "vitest";
import { parseAssignmentReviewDraft } from "@/lib/assignment-review-draft";

const SENTENCE_ONE = "11111111-1111-4111-8111-111111111111";
const SENTENCE_TWO = "22222222-2222-4222-8222-222222222222";

describe("assignment review drafts", () => {
  it("accepts a text/diary draft that covers every sentence exactly once", () => {
    const draft = {
      version: 1,
      kind: "text_assignment",
      sentences: [
        {
          sentenceId: SENTENCE_ONE,
          verdict: "needs_correction",
          corrections: [
            {
              id: "new-correction",
              operation: "insert",
              startOffset: 2,
              endOffset: 2,
              originalText: "",
              suggestedChinese: "很",
              suggestedPinyin: "hěn",
              suggestedEnglish: "very",
            },
          ],
        },
        {
          sentenceId: SENTENCE_TWO,
          verdict: "correct",
          corrections: [],
        },
      ],
      overrideInput: "95",
      extraComment: "<p>Good work</p>",
      recordingUrl: "https://www.loom.com/share/example",
    } as const;

    expect(
      parseAssignmentReviewDraft(draft, "diary", [
        SENTENCE_ONE,
        SENTENCE_TWO,
      ]),
    ).toEqual(draft);
  });

  it("preserves empty vocal-hack corrections while a reviewer is typing", () => {
    const draft = {
      version: 1,
      kind: "vocal_hack",
      sentences: [
        {
          sentenceId: SENTENCE_ONE,
          corrections: [{ chinese: "我", pinyin: "", english: "" }],
        },
      ],
      extraComment: "",
      recordingUrl: "",
    } as const;

    expect(
      parseAssignmentReviewDraft(draft, "vocal_hack", [SENTENCE_ONE]),
    ).toEqual(draft);
  });

  it("rejects a draft for the wrong review type", () => {
    const vocalDraft = {
      version: 1,
      kind: "vocal_hack",
      sentences: [{ sentenceId: SENTENCE_ONE, corrections: [] }],
      extraComment: "",
      recordingUrl: "",
    };

    expect(
      parseAssignmentReviewDraft(vocalDraft, "diary", [SENTENCE_ONE]),
    ).toBeNull();
  });

  it("rejects stale, missing, or duplicate sentence ids", () => {
    const textDraft = {
      version: 1,
      kind: "text_assignment",
      sentences: [
        { sentenceId: SENTENCE_ONE, verdict: "correct", corrections: [] },
        { sentenceId: SENTENCE_ONE, verdict: "correct", corrections: [] },
      ],
      overrideInput: "",
      extraComment: "",
      recordingUrl: "",
    };

    expect(
      parseAssignmentReviewDraft(textDraft, "text_assignment", [
        SENTENCE_ONE,
        SENTENCE_TWO,
      ]),
    ).toBeNull();
  });
});
