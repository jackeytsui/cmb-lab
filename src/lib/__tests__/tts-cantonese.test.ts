import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  synthesizeSpeechMiniMax,
  resolveCantoneseProvider,
  buildCacheKey,
  getHeaderCredential,
  getHeaderCredentialState,
  APPROVED_CANTONESE_TTS_MODEL,
  APPROVED_CANTONESE_VOICE_ID,
} from "@/lib/tts";

describe("header credential validation", () => {
  it("distinguishes missing, empty, malformed, and usable credentials", () => {
    expect(getHeaderCredentialState(undefined)).toBe("missing");
    expect(getHeaderCredentialState("  \n ")).toBe("empty");
    expect(getHeaderCredentialState("key with-spaces")).toBe(
      "contains-whitespace",
    );
    expect(getHeaderCredentialState("  valid-key  ")).toBe("usable");
  });

  it("returns only a trimmed, header-safe credential", () => {
    expect(getHeaderCredential(undefined)).toBeNull();
    expect(getHeaderCredential(" \n ")).toBeNull();
    expect(getHeaderCredential("key with-spaces")).toBeNull();
    expect(getHeaderCredential("  valid-key  ")).toBe("valid-key");
  });
});

describe("resolveCantoneseProvider", () => {
  it("always returns the approved MiniMax provider", () => {
    expect(resolveCantoneseProvider()).toBe("minimax");
  });
});

describe("synthesizeSpeechMiniMax", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "mm-key";
    delete process.env.MINIMAX_GROUP_ID;
    process.env.MINIMAX_CANTONESE_VOICE_ID = "unapproved-voice";
    process.env.MINIMAX_TTS_MODEL = "unapproved-model";
  });

  const okPayload = (hex: string) => ({
    data: { audio: hex },
    base_resp: { status_code: 0, status_msg: "success" },
  });

  it("pins language_boost Chinese,Yue and a Cantonese voice, decodes hex audio", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, o?: RequestInit) => {
      bodies.push(JSON.parse(String(o?.body)));
      return new Response(JSON.stringify(okPayload("010203")), { status: 200 });
    }));
    const buf = await synthesizeSpeechMiniMax("你好嗎？", "medium");
    expect(bodies[0].language_boost).toBe("Chinese,Yue");
    expect(bodies[0].model).toBe(APPROVED_CANTONESE_TTS_MODEL);
    expect(
      (bodies[0].voice_setting as { voice_id: string }).voice_id,
    ).toBe(APPROVED_CANTONESE_VOICE_ID);
    expect([...buf]).toEqual([1, 2, 3]);
  });

  it("keeps speed inside MiniMax's [0.5, 2] range for all rates", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, o?: RequestInit) => {
      bodies.push(JSON.parse(String(o?.body)));
      return new Response(JSON.stringify(okPayload("00")), { status: 200 });
    }));
    for (const rate of ["x-slow", "slow", "medium", "fast"] as const) {
      await synthesizeSpeechMiniMax("你好嗎？", rate);
    }
    for (const body of bodies) {
      const speed = (body.voice_setting as { speed: number }).speed;
      expect(speed).toBeGreaterThanOrEqual(0.5);
      expect(speed).toBeLessThanOrEqual(2);
    }
  });

  it("throws on a non-zero base_resp status even with HTTP 200", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(
        JSON.stringify({ base_resp: { status_code: 1002, status_msg: "rate limited" } }),
        { status: 200 },
      ),
    ));
    await expect(synthesizeSpeechMiniMax("你好嗎？", "medium")).rejects.toThrow(
      /MiniMax TTS error: 1002/,
    );
  });

  it("normalizes fetch TypeErrors into a provider error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("invalid header value containing a secret");
    }));

    await expect(synthesizeSpeechMiniMax("你好嗎？", "medium")).rejects.toThrow(
      "MiniMax TTS error: network request failed",
    );
  });

  it("rejects malformed response bodies without throwing a TypeError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("null", { status: 200 }),
    ));

    await expect(synthesizeSpeechMiniMax("你好嗎？", "medium")).rejects.toThrow(
      "MiniMax TTS error: invalid response",
    );
  });
});

describe("buildCacheKey", () => {
  it("uses the v7 namespace so older voice variants can never be served", () => {
    const key = buildCacheKey("你好", "zh-HK", "zh-HK-HiuMaanNeural", "medium");
    expect(key.startsWith("tts:v7:zh-HK:zh-HK-HiuMaanNeural:medium:")).toBe(true);
  });
});
