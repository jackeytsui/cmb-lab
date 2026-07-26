import { describe, expect, it } from "vitest";
import {
  buildDescription,
  extractQuestionShareUrl,
  extractQuestionText,
  extractQuestionVideoUrl,
  hasHan,
  normalizeFormToVocalHack,
  toVocalHackContent,
  type VideoAskForm,
  type VideoAskQuestion,
} from "../videoask-mapping";

describe("hasHan", () => {
  it("detects Chinese characters", () => {
    expect(hasHan("你好")).toBe(true);
    expect(hasHan("Say 你好")).toBe(true);
    expect(hasHan("hello world")).toBe(false);
    expect(hasHan("")).toBe(false);
    expect(hasHan(null)).toBe(false);
  });
});

describe("extractQuestionVideoUrl", () => {
  it("probes multiple candidate paths", () => {
    expect(extractQuestionVideoUrl({ media_url: "https://cdn/v.mp4" })).toBe(
      "https://cdn/v.mp4",
    );
    expect(
      extractQuestionVideoUrl({ media: { url: "https://cdn/n.mp4" } }),
    ).toBe("https://cdn/n.mp4");
    expect(
      extractQuestionVideoUrl({ media: { transcoded_url: "https://cdn/t.mp4" } }),
    ).toBe("https://cdn/t.mp4");
  });

  it("ignores non-http and missing URLs", () => {
    expect(extractQuestionVideoUrl({ media_url: "blob:abc" })).toBeNull();
    expect(extractQuestionVideoUrl({ media_url: "" })).toBeNull();
    expect(extractQuestionVideoUrl({})).toBeNull();
  });
});

describe("extractQuestionText / share url", () => {
  it("reads title/text/caption in priority order", () => {
    expect(extractQuestionText({ title: "T", text: "X" })).toBe("T");
    expect(extractQuestionText({ text: "只有文字" })).toBe("只有文字");
    expect(extractQuestionText({ settings: { title: "nested" } })).toBe("nested");
  });
  it("reads share url", () => {
    expect(extractQuestionShareUrl({ share_url: "https://videoask.com/x" })).toBe(
      "https://videoask.com/x",
    );
  });
});

describe("buildDescription", () => {
  it("wraps info texts as escaped paragraphs", () => {
    expect(buildDescription(["Welcome!", "Do <b>this</b>"])).toBe(
      "<p>Welcome!</p><p>Do &lt;b&gt;this&lt;/b&gt;</p>",
    );
  });
  it("falls back to default instructions when empty", () => {
    expect(buildDescription([])).toContain("record yourself imitating");
    expect(buildDescription(["  "])).toContain("record yourself imitating");
  });
});

describe("normalizeFormToVocalHack", () => {
  const form: VideoAskForm = {
    form_id: "form-1",
    title: "Vocal Hack — Greetings",
    share_url: "https://videoask.com/f/form-1",
  };

  it("maps a typed-caption form: each video step becomes a sentence with Chinese", () => {
    const questions: VideoAskQuestion[] = [
      { id: "q0", type: "text", raw: { type: "text", title: "Welcome to the drill" } },
      { id: "q1", type: "video", raw: { type: "video", title: "你好", media_url: "https://cdn/1.mp4" } },
      { id: "q2", type: "video", raw: { type: "video", title: "谢谢", media_url: "https://cdn/2.mp4" } },
    ];
    const result = normalizeFormToVocalHack(form, questions, {
      scrapedAt: "2026-07-18T00:00:00.000Z",
    });

    expect(result.videoaskFormId).toBe("form-1");
    expect(result.title).toBe("Vocal Hack — Greetings");
    expect(result.description).toBe("<p>Welcome to the drill</p>");
    expect(result.sentences).toHaveLength(2);
    expect(result.sentences[0]).toMatchObject({
      id: "va-q1",
      order: 0,
      videoUrl: "https://cdn/1.mp4",
      chinese: "你好",
      needsChinese: false,
      needsVideo: false,
    });
    expect(result.sentences[1].chinese).toBe("谢谢");
    expect(result.stats).toMatchObject({
      totalSteps: 3,
      videoSteps: 2,
      infoSteps: 1,
      sentencesNeedingChinese: 0,
    });
    expect(result.needsReview).toBe(false);
  });

  it("handles spoken-only forms: flags steps with no typed Chinese", () => {
    const questions: VideoAskQuestion[] = [
      { id: "q1", type: "video", raw: { type: "video", title: "Sentence 1", media_url: "https://cdn/1.mp4" } },
      { id: "q2", type: "video", raw: { type: "video", media_url: "https://cdn/2.mp4" } },
    ];
    const result = normalizeFormToVocalHack(form, questions);

    expect(result.sentences).toHaveLength(2);
    expect(result.sentences.every((s) => s.chinese === "")).toBe(true);
    expect(result.sentences.every((s) => s.needsChinese)).toBe(true);
    expect(result.stats.sentencesNeedingChinese).toBe(2);
    expect(result.needsReview).toBe(true);
    // Video URLs are still captured for mirroring.
    expect(result.sentences[0].videoUrl).toBe("https://cdn/1.mp4");
  });

  it("flags video-typed steps that have no downloadable media", () => {
    const questions: VideoAskQuestion[] = [
      { id: "q1", type: "video", raw: { type: "video", title: "你好", share_url: "https://videoask.com/s/q1" } },
    ];
    const result = normalizeFormToVocalHack(form, questions);
    expect(result.sentences[0]).toMatchObject({
      needsVideo: true,
      videoUrl: null,
      shareUrl: "https://videoask.com/s/q1",
      chinese: "你好",
    });
    expect(result.needsReview).toBe(true);
  });

  it("preserves step order and renumbers sentence order contiguously", () => {
    const questions: VideoAskQuestion[] = [
      { id: "a", type: "video", raw: { type: "video", title: "一", media_url: "https://cdn/a.mp4" } },
      { id: "b", type: "text", raw: { type: "text", title: "Halfway note" } },
      { id: "c", type: "video", raw: { type: "video", title: "二", media_url: "https://cdn/c.mp4" } },
    ];
    const result = normalizeFormToVocalHack(form, questions);
    expect(result.sentences.map((s) => s.order)).toEqual([0, 1]);
    expect(result.sentences.map((s) => s.chinese)).toEqual(["一", "二"]);
  });
});

describe("toVocalHackContent", () => {
  it("projects to the exact lesson content shape (no bookkeeping fields)", () => {
    const form: VideoAskForm = { form_id: "f", title: "T" };
    const lesson = normalizeFormToVocalHack(form, [
      { id: "q1", type: "video", raw: { type: "video", title: "你好", media_url: "https://cdn/1.mp4" } },
    ]);
    lesson.sentences[0].pinyin = "nǐ hǎo";
    lesson.sentences[0].english = "hello";

    const content = toVocalHackContent(lesson);
    expect(content).toEqual({
      description: expect.any(String),
      sentences: [
        {
          id: "va-q1",
          order: 0,
          videoUrl: "https://cdn/1.mp4",
          chinese: "你好",
          pinyin: "nǐ hǎo",
          english: "hello",
        },
      ],
    });
    // Bookkeeping fields must not leak into stored content.
    expect(content.sentences[0]).not.toHaveProperty("needsChinese");
    expect(content.sentences[0]).not.toHaveProperty("sourceVideoUrl");
  });
});
