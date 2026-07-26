import { describe, it, expect } from "vitest";
import {
  transformForm,
  resolveStepConnections,
  videoaskMarker,
  extractVideoaskFormId,
  GOODBYE_TARGET,
  type VideoAskForm,
} from "../videoask-migration";

/**
 * Fixture mirroring the real export shape (verified against the 439-form
 * account export of 2026-07-26): questions use `poll_options` for choices
 * and `logic_actions` for branching (`op: "always"` default jumps,
 * `op: "is"` option-conditional jumps, targets question/goodbye/url).
 */
const fixtureForm: VideoAskForm = {
  form_id: "abc123FormId",
  title: "Placement Check-in",
  status: "active",
  share_url: "https://www.videoask.com/fabc123",
  canvas_metadata: {
    positions: {
      "question:q1": { x: 0, y: 0 },
      "question:q2": { x: 480, y: 0 },
      "question:q3": { x: 960, y: 300 },
    },
  },
  questions: [
    {
      question_id: "q1",
      type: "poll",
      label: "1 Ready to practice?",
      media_type: "video",
      media_url: "https://media.videoask.com/q1.mp4",
      thumbnail: "https://media.videoask.com/q1.jpg",
      media_duration: 12.6,
      poll_options: [
        { id: "opt-yes", option_id: "opt-yes", content: "Yes, let's go" },
        { id: "opt-no", option_id: "opt-no", content: "Just browsing" },
      ],
      logic_actions: [
        {
          action: "jump",
          details: { to: { type: "question", value: "q2" } },
          condition: {
            op: "is",
            vars: [
              { type: "question", value: "q1" },
              { type: "option", value: "opt-yes" },
            ],
          },
        },
        {
          action: "jump",
          details: { to: { type: "goodbye", value: "default" } },
          condition: {
            op: "is",
            vars: [
              { type: "question", value: "q1" },
              { type: "option", value: "opt-no" },
            ],
          },
        },
        {
          action: "jump",
          details: { to: { type: "question", value: "q2" } },
          condition: { op: "always", vars: [] },
        },
      ],
    },
    {
      question_id: "q2",
      type: "standard",
      label: "2 Record this week's phrase",
      media_url: "https://media.videoask.com/q2.mp4",
      allowed_answer_media_types: ["audio", "video"],
      logic_actions: [
        {
          action: "jump",
          details: { to: { type: "question", value: "q3" } },
          condition: { op: "always", vars: [] },
        },
      ],
    },
    {
      question_id: "q3",
      type: "standard",
      label: "3 Book your call",
      media_url: "https://media.videoask.com/q3.mp4",
      allowed_answer_media_types: ["text"],
      logic_actions: [
        {
          action: "jump",
          details: { to: { type: "url", value: "https://calendly.com/x" } },
          condition: { op: "always", vars: [] },
        },
      ],
    },
  ],
};

describe("transformForm", () => {
  const thread = transformForm(fixtureForm);

  it("maps form metadata and embeds the idempotency marker", () => {
    expect(thread.vaFormId).toBe("abc123FormId");
    expect(thread.title).toBe("Placement Check-in");
    expect(thread.description).toContain(videoaskMarker("abc123FormId"));
    expect(thread.status).toBe("active");
  });

  it("appends a synthetic goodbye end screen when jumps target goodbye", () => {
    expect(thread.steps).toHaveLength(4);
    const goodbye = thread.steps[3];
    expect(goodbye.vaQuestionId).toBe(GOODBYE_TARGET);
    expect(goodbye.isEndScreen).toBe(true);
    expect(goodbye.responseType).toBe("button");
    expect(goodbye.mediaUrl).toBeNull();
  });

  it("maps poll questions to multiple_choice with content-based options", () => {
    const q1 = thread.steps[0];
    expect(q1.responseType).toBe("multiple_choice");
    expect(q1.responseOptions?.options).toEqual([
      { label: "Yes, let's go", value: "Yes, let's go" },
      { label: "Just browsing", value: "Just browsing" },
    ]);
  });

  it("translates op:is logic_actions into option jumps keyed by option content", () => {
    const q1 = thread.steps[0];
    expect(q1.optionJumps).toEqual([
      { optionValue: "Yes, let's go", vaTargetQuestionId: "q2" },
      { optionValue: "Just browsing", vaTargetQuestionId: GOODBYE_TARGET },
    ]);
    // op:always coexists as the default jump
    expect(q1.defaultJumpVaQuestionId).toBe("q2");
  });

  it("translates op:always logic_actions into default jumps", () => {
    const q2 = thread.steps[1];
    expect(q2.responseType).toBe("audio");
    expect(q2.allowedResponseTypes).toEqual(["audio", "video"]);
    expect(q2.defaultJumpVaQuestionId).toBe("q3");
    expect(q2.optionJumps).toEqual([]);
  });

  it("surfaces external url jumps instead of wiring them", () => {
    const q3 = thread.steps[2];
    expect(q3.externalUrlJumps).toEqual(["https://calendly.com/x"]);
    expect(q3.defaultJumpVaQuestionId).toBeNull();
  });

  it("scales canvas positions into builder coordinates", () => {
    const [q1, q2, q3] = thread.steps;
    expect(q1.positionX).toBe(60); // 0 scaled + offset
    expect(q2.positionX).toBe(60 + 320); // 480 / 1.5
    expect(q3.positionX).toBe(60 + 640); // 960 / 1.5
    expect(q3.positionY).toBe(150 + 200); // 300 / 1.5
  });

  it("keeps media urls and durations for the Mux ingest phase", () => {
    expect(thread.steps[0].mediaUrl).toBe("https://media.videoask.com/q1.mp4");
    expect(thread.steps[0].mediaDurationSeconds).toBe(13);
  });

  it("counts cross-question conditions instead of miswiring them", () => {
    const crossForm = transformForm({
      form_id: "cross",
      questions: [
        {
          question_id: "a",
          type: "standard",
          allowed_answer_media_types: ["text"],
          logic_actions: [
            {
              action: "jump",
              details: { to: { type: "question", value: "a" } },
              condition: {
                op: "is",
                vars: [
                  { type: "question", value: "other-question" },
                  { type: "option", value: "opt-x" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(crossForm.steps[0].crossQuestionConditions).toBe(1);
    expect(crossForm.steps[0].optionJumps).toEqual([]);
  });

  it("falls back to index-based positions and generated titles", () => {
    const bare = transformForm({
      form_id: "xyz",
      questions: [
        { question_id: "only", type: "standard" },
      ],
    });
    expect(bare.title).toBe("VideoAsk xyz");
    expect(bare.steps[0].positionX).toBe(60);
    // No answers collected and nothing after it → end screen
    expect(bare.steps[0].responseType).toBe("button");
    expect(bare.steps[0].isEndScreen).toBe(true);
  });
});

describe("resolveStepConnections", () => {
  const thread = transformForm(fixtureForm);
  const idMap = new Map([
    ["q1", "uuid-1"],
    ["q2", "uuid-2"],
    ["q3", "uuid-3"],
    [GOODBYE_TARGET, "uuid-end"],
  ]);

  it("resolves option jumps (including goodbye) into legacy logic entries", () => {
    const q1 = resolveStepConnections(thread.steps[0], idMap);
    expect(q1.logic).toEqual([
      { condition: "Yes, let's go", nextStepId: "uuid-2" },
      { condition: "Just browsing", nextStepId: "uuid-end" },
    ]);
    expect(q1.fallbackStepId).toBe("uuid-2");
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
    expect(q1.unresolved).toEqual(["q2", GOODBYE_TARGET, "q2"]);
  });
});

describe("idempotency marker", () => {
  it("round-trips through a thread description", () => {
    const description = `Migrated from VideoAsk. ${videoaskMarker("form_42-A")}`;
    expect(extractVideoaskFormId(description)).toBe("form_42-A");
  });

  it("returns null when absent", () => {
    expect(extractVideoaskFormId("plain description")).toBeNull();
    expect(extractVideoaskFormId(null)).toBeNull();
  });
});
