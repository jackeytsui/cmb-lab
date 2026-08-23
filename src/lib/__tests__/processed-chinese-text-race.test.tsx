// @vitest-environment happy-dom

import { act } from "react";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProcessedChineseText } from "@/hooks/useProcessedChineseText";

vi.mock("@/hooks/useTTS", () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    isPlaying: false,
    isLoading: false,
    error: null,
  }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shared Chinese text translation race", () => {
  it("finishes translation after equivalent segmentation arrives", async () => {
    const segmentation = deferred<Response>();
    const translation = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url === "/api/segment") return segmentation.promise;
        if (url === "/api/reader/translate-batch") return translation.promise;
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const { result } = renderHook(() =>
      useProcessedChineseText({
        committedText: "八角",
        scriptMode: "traditional",
        language: "zh-CN",
      }),
    );

    await waitFor(() => expect(result.current.isTranslating).toBe(true));

    await act(async () => {
      segmentation.resolve({
        ok: true,
        json: async () => ({
          segments: [[
            { text: "八", isWordLike: true },
            { text: "角", isWordLike: true },
          ]],
        }),
      } as Response);
      await segmentation.promise;
    });

    await waitFor(() => expect(result.current.isSegmenting).toBe(false));

    await act(async () => {
      translation.resolve({
        ok: true,
        json: async () => ({ translations: ["star anise"] }),
      } as Response);
      await translation.promise;
    });

    await waitFor(() => expect(result.current.isTranslating).toBe(false));
    expect(result.current.batchTranslations.get(0)).toBe("star anise");
  });
});
