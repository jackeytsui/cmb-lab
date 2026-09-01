import { afterEach, describe, expect, it, vi } from "vitest";
import {
  coalesceCaptions,
  fetchViaSupadata,
  type NormalizedCaption,
} from "@/lib/captions";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("YouTube caption extraction resilience", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the current Supadata transcript endpoint with one native Chinese request", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        lang: "zh",
        availableLangs: ["zh", "en"],
        content: [
          { text: "大家好", offset: 1_000, duration: 1_500, lang: "zh" },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchViaSupadata("wszdluHzTak", "chinese");

    expect(result).toEqual({
      lang: "zh",
      captions: [
        { text: "大家好", startMs: 1_000, endMs: 2_500, sequence: 1 },
      ],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/v1/transcript");
    expect(requestedUrl.searchParams.get("mode")).toBe("native");
    expect(requestedUrl.searchParams.get("lang")).toBe("zh");
    expect(requestedUrl.searchParams.get("videoId")).toBeNull();
    expect(requestedUrl.searchParams.get("url")).toContain("wszdluHzTak");
  });

  it("makes only one targeted retry when the first response exposes a matching language", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          lang: "en",
          availableLangs: ["en", "zh-TW"],
          content: [
            { text: "Hello", offset: 0, duration: 1_000, lang: "en" },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          lang: "zh-TW",
          availableLangs: ["en", "zh-TW"],
          content: [
            { text: "你好", offset: 0, duration: 1_000, lang: "zh-TW" },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchViaSupadata("wszdluHzTak", "chinese");

    expect(result?.lang).toBe("zh-TW");
    expect(result?.captions[0].text).toBe("你好");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(retryUrl.searchParams.get("lang")).toBe("zh-TW");
  });

  it("rejects a transcript from the wrong language family", async () => {
    vi.stubEnv("SUPADATA_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          lang: "en",
          availableLangs: ["en"],
          content: [
            { text: "Hello", offset: 0, duration: 1_000, lang: "en" },
          ],
        })
      )
    );

    await expect(
      fetchViaSupadata("wszdluHzTak", "chinese")
    ).resolves.toBeNull();
  });

  it("coalesces dense word fragments into readable timed lines", () => {
    const fragments: NormalizedCaption[] = Array.from(
      { length: 240 },
      (_, index) => ({
        text: index % 2 === 0 ? "大家 好" : "今天",
        startMs: index * 500,
        endMs: index * 500 + 1_500,
        sequence: index + 1,
      })
    );

    const result = coalesceCaptions(fragments);

    expect(result.length).toBeLessThan(50);
    expect(result[0].startMs).toBe(0);
    expect(result.at(-1)?.endMs).toBe(121_000);
    expect(result[0].text).not.toContain("大家 好");
    expect(result.map((caption) => caption.sequence)).toEqual(
      result.map((_, index) => index + 1)
    );
  });

  it("leaves already readable caption feeds unchanged", () => {
    const captions: NormalizedCaption[] = [
      {
        text: "大家好，歡迎來到新加坡。",
        startMs: 0,
        endMs: 4_000,
        sequence: 1,
      },
      {
        text: "今天我們一起去參觀。",
        startMs: 4_000,
        endMs: 8_000,
        sequence: 2,
      },
    ];

    expect(coalesceCaptions(captions)).toBe(captions);
  });
});
