import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  synthesizeSpeechElevenLabs,
  synthesizeSpeechMiniMax,
  resolveCantoneseProvider,
  buildCacheKey,
} from "@/lib/tts";

interface ElevenLabsRequestBody {
  model_id: string;
  language_code?: string;
  voice_settings: { stability: number; similarity_boost: number; speed: number };
}

describe("synthesizeSpeechElevenLabs Cantonese", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_CANTONESE_VOICE_ID = "voice-123";
    delete process.env.ELEVENLABS_CANTONESE_MODEL;
    delete process.env.ELEVENLABS_CANTONESE_LANGUAGE_CODE;
  });

  it("uses multilingual_v2 and sends NO language_code by default", async () => {
    const bodies: ElevenLabsRequestBody[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, o?: RequestInit) => {
      bodies.push(JSON.parse(String(o?.body)) as ElevenLabsRequestBody);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    await synthesizeSpeechElevenLabs("你好嗎？", "medium");
    expect(bodies[0].model_id).toBe("eleven_multilingual_v2");
    expect("language_code" in bodies[0]).toBe(false);
  });

  it("retries WITHOUT language_code when the model rejects it", async () => {
    process.env.ELEVENLABS_CANTONESE_MODEL = "eleven_turbo_v2_5";
    process.env.ELEVENLABS_CANTONESE_LANGUAGE_CODE = "yue";
    const bodies: ElevenLabsRequestBody[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, o?: RequestInit) => {
      bodies.push(JSON.parse(String(o?.body)) as ElevenLabsRequestBody);
      n++;
      if (n === 1)
        return new Response(
          JSON.stringify({ detail: { message: "does not support language_code 'yue'." } }),
          { status: 400 },
        );
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    const buf = await synthesizeSpeechElevenLabs("你好嗎？", "medium");
    expect(bodies.length).toBe(2);
    expect("language_code" in bodies[0]).toBe(true);
    expect("language_code" in bodies[1]).toBe(false);
    expect(buf.length).toBe(3);
  });

  it("keeps voice_settings.speed inside ElevenLabs' supported [0.7, 1.2] range", async () => {
    const bodies: ElevenLabsRequestBody[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: RequestInfo | URL, o?: RequestInit) => {
      bodies.push(JSON.parse(String(o?.body)) as ElevenLabsRequestBody);
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    await synthesizeSpeechElevenLabs("你好嗎？", "x-slow");
    await synthesizeSpeechElevenLabs("你好嗎？", "slow");
    await synthesizeSpeechElevenLabs("你好嗎？", "medium");
    await synthesizeSpeechElevenLabs("你好嗎？", "fast");
    for (const body of bodies) {
      expect(body.voice_settings.speed).toBeGreaterThanOrEqual(0.7);
      expect(body.voice_settings.speed).toBeLessThanOrEqual(1.2);
    }
  });
});

describe("resolveCantoneseProvider", () => {
  const minimaxEnv = { MINIMAX_API_KEY: "k" };
  const azureEnv = { AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastus" };
  const elevenEnv = {
    ELEVENLABS_API_KEY: "k",
    ELEVENLABS_CANTONESE_VOICE_ID: "v",
  };

  it("prefers MiniMax when configured (explicit Cantonese mode)", () => {
    expect(
      resolveCantoneseProvider({ ...minimaxEnv, ...azureEnv, ...elevenEnv }),
    ).toBe("minimax");
    expect(resolveCantoneseProvider(minimaxEnv)).toBe("minimax");
  });

  it("defaults to Azure when MiniMax is absent, even if ElevenLabs is configured", () => {
    expect(resolveCantoneseProvider({ ...azureEnv, ...elevenEnv })).toBe("azure");
    expect(resolveCantoneseProvider(azureEnv)).toBe("azure");
  });

  it("honors explicit provider overrides", () => {
    expect(
      resolveCantoneseProvider({
        ...minimaxEnv,
        ...azureEnv,
        ...elevenEnv,
        CANTONESE_TTS_PROVIDER: "elevenlabs",
      }),
    ).toBe("elevenlabs");
    expect(
      resolveCantoneseProvider({
        ...minimaxEnv,
        ...azureEnv,
        CANTONESE_TTS_PROVIDER: "azure",
      }),
    ).toBe("azure");
  });

  it("ignores an override for an unconfigured provider", () => {
    expect(
      resolveCantoneseProvider({
        ...azureEnv,
        CANTONESE_TTS_PROVIDER: "elevenlabs",
      }),
    ).toBe("azure");
    expect(
      resolveCantoneseProvider({
        ...azureEnv,
        CANTONESE_TTS_PROVIDER: "minimax",
      }),
    ).toBe("azure");
  });

  it("falls back to ElevenLabs then OpenAI when MiniMax and Azure are absent", () => {
    expect(resolveCantoneseProvider(elevenEnv)).toBe("elevenlabs");
    expect(resolveCantoneseProvider({ OPENAI_API_KEY: "k" })).toBe("openai");
  });
});

describe("synthesizeSpeechMiniMax", () => {
  beforeEach(() => {
    process.env.MINIMAX_API_KEY = "mm-key";
    delete process.env.MINIMAX_GROUP_ID;
    delete process.env.MINIMAX_CANTONESE_VOICE_ID;
    delete process.env.MINIMAX_TTS_MODEL;
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
    expect(
      (bodies[0].voice_setting as { voice_id: string }).voice_id,
    ).toBe("Cantonese_GentleLady");
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
});

describe("buildCacheKey", () => {
  it("uses the v6 namespace so wrong-accent v5 entries can never be served", () => {
    const key = buildCacheKey("你好", "zh-HK", "zh-HK-HiuMaanNeural", "medium");
    expect(key.startsWith("tts:v6:zh-HK:zh-HK-HiuMaanNeural:medium:")).toBe(true);
  });
});
