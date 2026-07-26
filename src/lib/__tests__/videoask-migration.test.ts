import { describe, it, expect } from "vitest";
import {
  transformForm,
  resolveStepConnections,
  videoaskMarker,
  extractVideoaskFormId,
  type VideoAskForm,
} from "../videoask-migration";

/**
 * Fixture modeled on a real VideoAsk form export:
 * q1 welcome video with two buttons that branch,
 * q2 audio-response question, q3 text question, q4 thank-you end screen.
 */
const fixtureForm: VideoAskForm = {
  form_id: "abc123FormId",
  title: "Placement Check-in",
  description: "Weekly speaking check-in",
  share_url: "https://www.videoask.com/fabc123",
  respondents_count: 42,
  questions: [
    {
      question_id: "q1",
      type: "multiple_choice",
      overlay_text: "Ready to practice?",
      media_type: "video",
      media_url: "https://media.videoask.com/q1.mp4",
      thumbnail: "https://media.videoask.com/q1.jpg",
      options: [
        { option_id: "o1", label: "Yes, let's go", target_question_id: "q2" },
        { option_id: "o2", label: "Just browsing", jump_to_question_id: "q4" },
      ],
    },
    {
      question_id: "q2",
      type: "standard",
      title: "Record your answer in Mandarin",
      media_type: "video",
      media_url: "https://media.videoask.com/q2.mp4",
      allowed_answer_media_types: ["audio", "video"],
      jump_to_question_id: "q3",
    },
    {
      question_id: "q3",
      type: "standard",
      label: "Type the sentence",
      media_url: "https://media.videoask.com/q3.mp4",
      allowed_answer_media_types: ["text"],
    },
    {
      question_id: "q4",
      type: "thank_you",
      overlay_text: "Thanks — see you next week!",
      media_url: "https://media.videoask.com/q4.mp4",
    },
  ],
};

describe("transformForm", () => {
  const thread = transformForm(fixtureForm);

  it("maps form metadata and embeds the idempotency marker", () => {
    expect(thread.vaFormId).toBe("abc123FormId");
    expect(thread.title).toBe("Placement Check-in");
    expect(thread.description).toContain("Weekly speaking check-in");
    expect(thread.description).toContain(videoaskMarker("abc123FormId"));
    expect(thread.respondentsCount).toBe(42);
  });

  it("produces one step per question with stable sort order and positions", () => {
    expect(thread.steps).toHaveLength(4);
    expect(thread.steps.map((s) => s.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(thread.steps[0].positionX).toBeLessThan(thread.steps[1].positionX);
  });

  it("maps option questions to multiple_choice with label/value options", () => {
    const q1 = thread.steps[0];
    expect(q1.responseType).toBe("multiple_choice");
    expect(q1.responseOptions?.options).toEqual([
      { label: "Yes, let's go", value: "Yes, let's go" },
      { label: "Just browsing", value: "Just browsing" },
    ]);
  });

  it("captures option jumps across API field spellings", () => {
    const q1 = thread.steps[0];
    expect(q1.optionJumps).toEqual([
      { optionValue: "Yes, let's go", vaTargetQuestionId: "q2" },
      { optionValue: "Just browsing", vaTargetQuestionId: "q4" },
    ]);
  });

  it("maps allowed answer media types to response types", () => {
    const q2 = thread.steps[1];
    expect(q2.responseType).toBe("audio");
    expect(q2.allowedResponseTypes).toEqual(["audio", "video"]);
    expect(q2.defaultJumpVaQuestionId).toBe("q3");

    const q3 = thread.steps[2];
    expect(q3.responseType).toBe("text");
    expect(q3.allowedResponseTypes).toBeNull();
  });

  it("marks thank-you questions as end screens with button type", () => {
    const q4 = thread.steps[3];
    expect(q4.responseType).toBe("button");
    expect(q4.isEndScreen).toBe(true);
  });

  it("keeps media urls for the Mux ingest phase", () => {
    expect(thread.steps.map((s) => s.mediaUrl)).toEqual([
      "https://media.videoask.com/q1.mp4",
      "https://media.videoask.com/q2.mp4",
      "https://media.videoask.com/q3.mp4",
      "https://media.videoask.com/q4.mp4",
    ]);
  });

  it("falls back to a generated title when the form has none", () => {
    const untitled = transformForm({ form_id: "xyz" });
    expect(untitled.title).toBe("VideoAsk xyz");
    expect(untitled.steps).toHaveLength(0);
  });

  it("marks a trailing no-answer question as an end screen even without type", () => {
    const linear = transformForm({
      form_id: "lin",
      questions: [
        {
          question_id: "a",
          allowed_answer_media_types: ["text"],
          media_url: "https://media.videoask.com/a.mp4",
        },
        { question_id: "b", media_url: "https://media.videoask.com/b.mp4" },
      ],
    });
    expect(linear.steps[1].responseType).toBe("button");
    expect(linear.steps[1].isEndScreen).toBe(true);
  });
});

describe("resolveStepConnections", () => {
  const thread = transformForm(fixtureForm);
  const idMap = new Map([
    ["q1", "uuid-1"],
    ["q2", "uuid-2"],
    ["q3", "uuid-3"],
    ["q4", "uuid-4"],
  ]);

  it("resolves option jumps into legacy logic entries", () => {
    const q1 = resolveStepConnections(thread.steps[0], idMap);
    expect(q1.logic).toEqual([
      { condition: "Yes, let's go", nextStepId: "uuid-2" },
      { condition: "Just browsing", nextStepId: "uuid-4" },
    ]);
    expect(q1.fallbackStepId).toBeNull();
    expect(q1.unresolved).toEqual([]);
  });

  it("resolves default jumps into fallbackStepId", () => {
    const q2 = resolveStepConnections(thread.steps[1], idMap);
    expect(q2.logic).toBeNull();
    expect(q2.fallbackStepId).toBe("uuid-3");
  });

  it("reports unresolved targets instead of writing dangling ids", () => {
    const partialMap = new Map([["q1", "uuid-1"]]);
    const q1 = resolveStepConnections(thread.steps[0], partialMap);
    expect(q1.logic).toBeNull();
    expect(q1.unresolved).toEqual(["q2", "q4"]);
  });
});

describe("idempotency marker", () => {
  it("round-trips through a thread description", () => {
    const description = `Some notes\n\nMigrated from VideoAsk. ${videoaskMarker(
      "form_42-A"
    )}`;
    expect(extractVideoaskFormId(description)).toBe("form_42-A");
  });

  it("returns null when absent", () => {
    expect(extractVideoaskFormId("plain description")).toBeNull();
    expect(extractVideoaskFormId(null)).toBeNull();
  });
});
