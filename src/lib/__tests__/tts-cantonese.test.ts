import { describe, it, expect, beforeEach, vi } from "vitest";
import { synthesizeSpeechElevenLabs } from "@/lib/tts";

describe("synthesizeSpeechElevenLabs Cantonese", () => {
  beforeEach(() => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    process.env.ELEVENLABS_CANTONESE_VOICE_ID = "voice-123";
    delete process.env.ELEVENLABS_CANTONESE_MODEL;
    delete process.env.ELEVENLABS_CANTONESE_LANGUAGE_CODE;
  });

  it("uses multilingual_v2 and sends NO language_code by default", async () => {
    const bodies: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_u: any, o: any) => {
      bodies.push(JSON.parse(o.body));
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    }));
    await synthesizeSpeechElevenLabs("你好嗎？", "medium");
    expect(bodies[0].model_id).toBe("eleven_multilingual_v2");
    expect("language_code" in bodies[0]).toBe(false);
  });

  it("retries WITHOUT language_code when the model rejects it", async () => {
    process.env.ELEVENLABS_CANTONESE_MODEL = "eleven_turbo_v2_5";
    process.env.ELEVENLABS_CANTONESE_LANGUAGE_CODE = "yue";
    const bodies: any[] = [];
    let n = 0;
    vi.stubGlobal("fetch", vi.fn(async (_u: any, o: any) => {
      bodies.push(JSON.parse(o.body));
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
});
