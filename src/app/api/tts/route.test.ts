import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "test-user", sessionClaims: {} })),
}));
vi.mock("@/lib/rate-limit", () => ({
  ttsLimiter: {},
  ttsLimiterElevated: {},
  selectLimiter: () => ({ limit: async () => ({ success: true }) }),
  rateLimitResponse: vi.fn(),
}));
vi.mock("@upstash/redis", () => ({ Redis: { fromEnv: vi.fn() } }));

describe("Cantonese voice continuity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("MINIMAX_API_KEY", "test-minimax-key");
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    vi.stubEnv("CANTONESE_TTS_PROVIDER", "minimax");
    vi.stubEnv("TTS_PROVIDER", "openai");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each(["zh-HK", "cantonese"])("does not replace a failed native %s voice with OpenAI", async (language) => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("minimax.io")) {
        return new Response(JSON.stringify({
          base_resp: { status_code: 1002, status_msg: "rate limited" },
        }));
      }
      return new Response(new Uint8Array([1, 2, 3]));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://example.com/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: "你好", language }),
    }));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("minimax.io");
  });

  it("keeps the existing native Cantonese voice on successful requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      base_resp: { status_code: 0 }, data: { audio: "010203" },
    })));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://example.com/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: "你好", language: "zh-HK" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-TTS-Provider")).toBe("minimax");
  });

  it("leaves Mandarin voice selection unchanged", async () => {
    const fetchMock = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("https://example.com/api/tts", {
      method: "POST",
      body: JSON.stringify({ text: "你好", language: "zh-CN" }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-TTS-Provider")).toBe("openai");
  });
});
