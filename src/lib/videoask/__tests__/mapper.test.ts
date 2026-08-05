import { describe, expect, it } from "vitest";
import { normalizeVideoAskForm } from "../mapper";

describe("normalizeVideoAskForm", () => {
  it("preserves video, prompt text, response modes, and transcription", () => {
    const form = normalizeVideoAskForm({
      form_id: "form-1",
      title: "Conversation practice",
      folder_id: "folder-1",
      updated_at: "2026-01-02T03:04:05Z",
      questions: [
        {
          question_id: "question-1",
          label: "1",
          type: "standard",
          media_id: "media-1",
          media_type: "video",
          media_url: "https://media.videoask.com/example.mp4",
          transcription: "Welcome to the exercise.",
          metadata: { text: "Introduce yourself" },
          allowed_answer_media_types: ["video", "audio", "text"],
        },
      ],
    });

    expect(form.title).toBe("Conversation practice");
    expect(form.folderId).toBe("folder-1");
    expect(form.questions[0]).toMatchObject({
      id: "question-1",
      promptText: "Introduce yourself",
      transcription: "Welcome to the exercise.",
      mediaId: "media-1",
      mediaUrl: "https://media.videoask.com/example.mp4",
      responseType: "video",
      allowedResponseTypes: ["video", "audio", "text"],
    });
  });

  it("maps poll choices and conditional jumps to canonical option values", () => {
    const form = normalizeVideoAskForm({
      form_id: "form-2",
      title: "Branching poll",
      questions: [
        {
          question_id: "q1",
          label: "1",
          type: "poll",
          poll_options: [
            { id: "yes-id", content: "Yes" },
            { id: "no-id", content: "No" },
          ],
          logic_actions: [
            {
              action: "jump",
              condition: { op: "is", vars: ["q1", "yes-id"] },
              details: { to: { type: "question", value: "q2" } },
            },
            {
              action: "jump",
              condition: { op: "is", vars: ["q1", "no-id"] },
              details: { to: { type: "goodbye", value: "default" } },
            },
          ],
        },
        { question_id: "q2", label: "2", type: "standard" },
      ],
    });

    expect(form.questions[0].responseType).toBe("multiple_choice");
    expect(form.questions[0].options).toEqual([
      expect.objectContaining({ label: "Yes", value: "yes-id" }),
      expect.objectContaining({ label: "No", value: "no-id" }),
    ]);
    expect(form.questions[0].logicEdges).toEqual([
      expect.objectContaining({ conditionValue: "yes-id", targetQuestionId: "q2" }),
      expect.objectContaining({ conditionValue: "no-id", targetQuestionId: null }),
    ]);
  });

  it("maps an unconditional goodbye and supplies Continue for display-only steps", () => {
    const form = normalizeVideoAskForm({
      form_id: "form-3",
      questions: [
        {
          question_id: "q1",
          label: "1",
          type: "standard",
          logic_actions: [
            {
              action: "jump",
              condition: { op: "always", vars: [] },
              details: { to: { type: "goodbye", value: "default" } },
            },
          ],
        },
      ],
    });

    expect(form.questions[0].explicitEnd).toBe(true);
    expect(form.questions[0].responseType).toBe("button");
    expect(form.questions[0].options[0]).toMatchObject({
      label: "Continue",
      value: "continue",
    });
  });
});
