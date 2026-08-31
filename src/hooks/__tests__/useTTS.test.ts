// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTTS } from "../useTTS";

vi.mock("next/navigation", () => ({ usePathname: () => "/reader/cantonese" }));

describe("useTTS voice continuity", () => {
  let deviceSpeak: ReturnType<typeof vi.fn>;
  let play: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deviceSpeak = vi.fn((utterance) => { utterance.onend?.(); });
    vi.stubGlobal("speechSynthesis", {
      cancel: vi.fn(), speak: deviceSpeak,
      getVoices: () => [{ lang: "zh-HK" }, { lang: "zh-CN" }],
    });
    vi.stubGlobal("SpeechSynthesisUtterance", class {});
    play = vi.fn().mockRejectedValue(new DOMException("Blocked", "NotAllowedError"));
    vi.stubGlobal("Audio", class {
      play = play;
      pause = vi.fn();
      currentTime = 0;
    });
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test-audio");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["zh-HK", "cantonese"] as const)("does not switch %s to a device voice when the service fails", async (language) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    const { result } = renderHook(() => useTTS());
    await act(async () => { await result.current.speak("你好", { language }); });
    expect(deviceSpeak).not.toHaveBeenCalled();
    expect(result.current.error).toContain("temporarily unavailable");
    expect(result.current.isPlaying).toBe(false);
  });

  it("retains fetched Cantonese audio for a second tap instead of substituting a device voice", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useTTS());
    await act(async () => { await result.current.speak("你好", { language: "zh-HK" }); });
    expect(deviceSpeak).not.toHaveBeenCalled();
    expect(result.current.error).toContain("Tap");
    play.mockImplementationOnce(function (this: { onended: (() => void) | null }) {
      queueMicrotask(() => this.onended?.());
      return Promise.resolve();
    });
    await act(async () => { await result.current.speak("你好", { language: "zh-HK" }); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
    expect(result.current.isPlaying).toBe(false);
  });

  it("allows the native provider's 15-second deadline before timing out", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, options: RequestInit) => {
      requestSignal = options.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }));
    const { result } = renderHook(() => useTTS());
    await act(async () => {
      const pending = result.current.speak("你好", { language: "zh-HK" });
      await vi.advanceTimersByTimeAsync(15000);
      expect(requestSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
    });
    expect(requestSignal?.aborted).toBe(true);
    expect(deviceSpeak).not.toHaveBeenCalled();
    expect(result.current.error).toContain("temporarily unavailable");
  });

  it("preserves the existing Mandarin device fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 502 })));
    const { result } = renderHook(() => useTTS());
    await act(async () => { await result.current.speak("你好", { language: "zh-CN" }); });
    expect(deviceSpeak).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBeNull();
  });
});
