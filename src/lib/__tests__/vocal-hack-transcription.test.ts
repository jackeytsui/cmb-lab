import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  openai: vi.fn(() => "model"),
  convertScript: vi.fn(async (text: string) => text),
  smartRomanise: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("ai", () => ({ generateObject: mocks.generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: mocks.openai }));
vi.mock("@/lib/chinese-convert", () => ({ convertScript: mocks.convertScript }));
vi.mock("@/lib/romanise", () => ({ smartRomanise: mocks.smartRomanise }));

import { transcribeVocalHackVideo } from "@/lib/vocal-hack-transcription";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.openai.mockReturnValue("model");
  mocks.convertScript.mockImplementation(async (text: string) => text);
  vi.stubEnv("OPENAI_API_KEY", "openai-test-key");
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "blob-test-token");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Vocal Hack video transcription", () => {
  it("starts transcription after every successful lesson-entry video upload", () => {
    const editorSource = readFileSync(
      path.join(
        process.cwd(),
        "src/app/(dashboard)/admin/course-library/[courseId]/lessons/[lessonId]/LessonEditorClient.tsx",
      ),
      "utf8",
    );

    expect(editorSource).toContain(
      '"/api/admin/course-library/vocal-hack-transcribe"',
    );
    expect(editorSource).toContain(
      "await transcribeUploadedVideo(id, result.url)",
    );
    expect(editorSource).toContain(
      "body: JSON.stringify({ videoUrl, language: lang })",
    );
    expect(editorSource).toContain("chinese: result.chinese.trim()");
    expect(editorSource).toContain("pinyin: result.pinyin.trim()");
    expect(editorSource).toContain("english: result.english.trim()");
  });

  it.each([
    {
      language: "mandarin" as const,
      raw: "你好。你好。",
      modelChinese: "你好。",
      chinese: "你好。",
      romanisation: "nǐ hǎo",
      script: "简体中文",
      wording: "standard Mandarin wording",
    },
    {
      language: "cantonese" as const,
      raw: "听日见。听日见。",
      modelChinese: "听日见。",
      chinese: "聽日見。",
      romanisation: "ting1 jat6 gin3",
      script: "繁體中文",
      wording: "Traditional Chinese characters and Cantonese wording",
    },
  ])(
    "transcribes $language and derives matching romanisation and English",
    async ({
      language,
      raw,
      modelChinese,
      chinese,
      romanisation,
      script,
      wording,
    }) => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Blob(["coach-video"]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          }),
        )
        .mockResolvedValueOnce(Response.json({ text: raw }));
      vi.stubGlobal("fetch", fetchMock);
      mocks.generateObject.mockResolvedValue({
        object: { chinese: modelChinese, english: "Hello." },
      });
      mocks.convertScript.mockResolvedValue(chinese);
      mocks.smartRomanise.mockReturnValue(romanisation);

      await expect(
        transcribeVocalHackVideo({
          videoUrl:
            "https://store123.private.blob.vercel-storage.com/course-library/video/coach.mp4",
          language,
          context: "Uploaded lesson entry",
        }),
      ).resolves.toEqual({
        rawTranscript: raw,
        chinese,
        pinyin: romanisation,
        english: "Hello.",
      });

      const transcriptionBody = fetchMock.mock.calls[1][1]?.body as FormData;
      expect(transcriptionBody.get("language")).toBe("zh");
      expect(transcriptionBody.get("prompt")).toContain(script);
      expect(mocks.generateObject.mock.calls[0][0].system).toContain(wording);
      expect(mocks.convertScript).toHaveBeenCalledWith(
        modelChinese,
        "original",
        language === "cantonese" ? "traditional" : "simplified",
      );
      expect(mocks.smartRomanise).toHaveBeenCalledWith(chinese, language);
    },
  );

  it("rejects a cleaned transcript without Chinese characters", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Blob(["coach-video"]), {
            status: 200,
            headers: { "content-type": "video/mp4" },
          }),
        )
        .mockResolvedValueOnce(Response.json({ text: "hello" })),
    );
    mocks.generateObject.mockResolvedValue({
      object: { chinese: "hello", english: "Hello." },
    });

    await expect(
      transcribeVocalHackVideo({
        videoUrl:
          "https://store123.private.blob.vercel-storage.com/course-library/video/coach.mp4",
        language: "mandarin",
        context: "Uploaded lesson entry",
      }),
    ).rejects.toThrow("usable Chinese sentence");
  });
});
