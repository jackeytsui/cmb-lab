import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  synthesizeSpeechElevenLabs,
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
  const azureEnv = { AZURE_SPEECH_KEY: "k", AZURE_SPEECH_REGION: "eastus" };
  const elevenEnv = {
    ELEVENLABS_API_KEY: "k",
    ELEVENLABS_CANTONESE_VOICE_ID: "v",
  };

  it("defaults to Azure when Azure is configured, even if ElevenLabs is too", () => {
    expect(resolveCantoneseProvider({ ...azureEnv, ...elevenEnv })).toBe("azure");
    expect(resolveCantoneseProvider(azureEnv)).toBe("azure");
  });

  it("only uses ElevenLabs on explicit opt-in", () => {
    expect(
      resolveCantoneseProvider({
        ...azureEnv,
        ...elevenEnv,
        CANTONESE_TTS_PROVIDER: "elevenlabs",
      }),
    ).toBe("elevenlabs");
  });

  it("ignores an elevenlabs opt-in when ElevenLabs is not configured", () => {
    expect(
      resolveCantoneseProvider({
        ...azureEnv,
        CANTONESE_TTS_PROVIDER: "elevenlabs",
      }),
    ).toBe("azure");
  });

  it("falls back to ElevenLabs then OpenAI when Azure is absent", () => {
    expect(resolveCantoneseProvider(elevenEnv)).toBe("elevenlabs");
    expect(resolveCantoneseProvider({ OPENAI_API_KEY: "k" })).toBe("openai");
  });
});

describe("buildCacheKey", () => {
  it("uses the v6 namespace so wrong-accent v5 entries can never be served", () => {
    const key = buildCacheKey("你好", "zh-HK", "zh-HK-HiuMaanNeural", "medium");
    expect(key.startsWith("tts:v6:zh-HK:zh-HK-HiuMaanNeural:medium:")).toBe(true);
  });
});
