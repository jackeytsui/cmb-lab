// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCoachingSessionRecordingUrl,
  mergeSessionsAfterRefresh,
  shouldCommitCoachingDraft,
  useProcessedText,
} from "@/app/(dashboard)/dashboard/coaching/CoachingMaterialClient";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const translationMocks = vi.hoisted(() => ({
  fetchProperTranslations: vi.fn(),
}));

vi.mock("@/lib/mandarin-generation", () => translationMocks);

vi.mock("@/hooks/useTTS", () => ({
  useTTS: () => ({
    speak: vi.fn(),
    stop: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    isPaused: false,
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

async function waitFor(assertion: () => void, timeoutMs = 1_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }
  assertion();
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    title: "Session 1",
    type: "inner_circle" as const,
    createdAt: "2026-08-21T12:00:00.000Z",
    updatedAt: "2026-08-21T12:00:00.000Z",
    notes: [],
    mandarin: {
      draftText: "",
      committedText: "",
      scriptMode: "simplified" as const,
    },
    cantonese: {
      draftText: "",
      committedText: "",
      scriptMode: "simplified" as const,
    },
    ...overrides,
  };
}

afterEach(() => {
  translationMocks.fetchProperTranslations.mockReset();
  vi.unstubAllGlobals();
});

describe("coaching note refresh races", () => {
  it("uses only the canonical recording link", () => {
    expect(
      getCoachingSessionRecordingUrl({
        recordingUrl: "https://fathom.video/share/session-123",
      }),
    ).toBe("https://fathom.video/share/session-123");

    expect(
      getCoachingSessionRecordingUrl({
        recordingUrl: "https://www.loom.com/share/recording-456",
      }),
    ).toBe("https://www.loom.com/share/recording-456");
    expect(
      getCoachingSessionRecordingUrl({
        recordingUrl: "javascript:alert(1)",
      }),
    ).toBeNull();
  });

  it("does not submit Chinese IME candidate confirmation as a completed note", () => {
    expect(
      shouldCommitCoachingDraft({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        keyCode: 13,
      }),
    ).toBe(false);
    expect(
      shouldCommitCoachingDraft({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        keyCode: 229,
      }),
    ).toBe(false);
    expect(
      shouldCommitCoachingDraft({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(true);
    expect(
      shouldCommitCoachingDraft({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        keyCode: 13,
      }),
    ).toBe(false);
  });

  it("preserves both unsaved drafts when the polling response refreshes sessions", () => {
    const previous = session({
      mandarin: {
        draftText: "我還在輸入",
        committedText: "old local value",
        scriptMode: "traditional" as const,
      },
      cantonese: {
        draftText: "我仲打緊字",
        committedText: "old local value",
        scriptMode: "traditional" as const,
      },
    });
    const refreshed = session({
      title: "Updated remotely",
      mandarin: {
        draftText: "",
        committedText: "server value",
        scriptMode: "simplified" as const,
      },
      cantonese: {
        draftText: "",
        committedText: "server value",
        scriptMode: "simplified" as const,
      },
    });

    const [merged] = mergeSessionsAfterRefresh([refreshed], [previous]);

    expect(merged.title).toBe("Updated remotely");
    expect(merged.mandarin.draftText).toBe("我還在輸入");
    expect(merged.cantonese.draftText).toBe("我仲打緊字");
    expect(merged.mandarin.committedText).toBe("server value");
    expect(merged.mandarin.scriptMode).toBe("traditional");
    expect(merged.cantonese.scriptMode).toBe("traditional");
  });

  it("finishes translation when segmentation replaces sentences with equivalent text", async () => {
    const segmentation = deferred<Response>();
    const translation = deferred<string[] | null>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url !== "/api/segment") {
          throw new Error(`Unexpected request: ${url}`);
        }
        return segmentation.promise;
      }),
    );
    translationMocks.fetchProperTranslations.mockReturnValue(translation.promise);

    const container = document.createElement("div");
    let root: Root | null = createRoot(container);
    function Harness() {
      const result = useProcessedText({
        committedText: "八角",
        scriptMode: "traditional",
        language: "zh-CN",
      });
      return (
        <output
          data-segmenting={String(result.isSegmenting)}
          data-translating={String(result.isTranslating)}
        >
          {result.batchTranslations.get(0) ?? ""}
        </output>
      );
    }

    await act(async () => {
      root?.render(<Harness />);
    });

    await waitFor(() => {
      expect(translationMocks.fetchProperTranslations).toHaveBeenCalledTimes(1);
      expect(container.querySelector("output")?.dataset.translating).toBe("true");
    });

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

    await waitFor(() =>
      expect(container.querySelector("output")?.dataset.segmenting).toBe("false"),
    );
    expect(translationMocks.fetchProperTranslations).toHaveBeenCalledTimes(1);

    await act(async () => {
      translation.resolve(["star anise"]);
      await translation.promise;
    });

    await waitFor(() =>
      expect(container.querySelector("output")?.dataset.translating).toBe("false"),
    );
    expect(container.querySelector("output")?.textContent).toBe("star anise");

    await act(async () => {
      root?.unmount();
      root = null;
    });
  });
});
