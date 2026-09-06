import { afterEach, describe, expect, it, vi } from "vitest";
import {
  properBatchTranslationSystem,
  singleTranslationSystem,
  wordGlossTranslationSystem,
} from "@/lib/chinese-translation-prompts";
import { fetchProperTranslations } from "@/lib/mandarin-generation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Cantonese-to-English routing", () => {
  it("explicitly forbids Mandarin reinterpretation in every translation mode", () => {
    for (const prompt of [
      properBatchTranslationSystem("zh-HK"),
      wordGlossTranslationSystem("zh-HK"),
      singleTranslationSystem("zh-HK"),
    ]) {
      expect(prompt).toContain("strictly as Cantonese (Yue, Hong Kong)");
      expect(prompt).toContain("Do not reinterpret the source as Mandarin");
    }
  });

  it("sends assignment annotation requests with the Cantonese language code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ translations: ["I am going to the bank."] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProperTranslations(["我去銀行"], "zh-HK")).resolves.toEqual([
      "I am going to the bank.",
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({
      mode: "proper",
      language: "zh-HK",
    });
  });

  it("does not retry an explicitly non-retryable provider outage", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        code: "translation_unavailable",
        retryable: false,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchProperTranslations(["你好"], "zh-CN")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
