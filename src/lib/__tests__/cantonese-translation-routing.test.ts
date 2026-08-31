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
});
