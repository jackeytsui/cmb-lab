import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { Redis } from "@upstash/redis";
import {
  ttsLimiter,
  ttsLimiterElevated,
  rateLimitResponse,
  selectLimiter,
} from "@/lib/rate-limit";
import {
  resolveVoice,
  resolveCantoneseProvider,
  buildSSML,
  buildPhonemeSSML,
  buildCacheKey,
  getCacheTTL,
  synthesizeSpeech,
  synthesizeSpeechElevenLabs,
  synthesizeSpeechMiniMax,
  escapeXml,
  MINIMAX_DEFAULT_CANTONESE_VOICE,
} from "@/lib/tts";
import type { TTSLanguage, TTSRate } from "@/lib/tts";

// Safely initialize Redis or fallback to mock
let redis: Redis;
try {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    redis = Redis.fromEnv();
  } else {
    throw new Error("Missing Upstash credentials");
  }
} catch (error) {
  console.warn("Redis init failed in TTS route, using mock:", error);
  redis = {
    get: async () => null,
    set: async () => "OK",
  } as unknown as Redis;
}

const VALID_LANGUAGES: TTSLanguage[] = ["zh-CN", "zh-HK", "mandarin", "cantonese"];
const VALID_RATES: TTSRate[] = ["x-slow", "slow", "medium", "fast"];
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = "alloy";
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "").toLowerCase();

function mapOpenAiSpeed(rate: TTSRate): number {
  switch (rate) {
    case "x-slow":
      return 0.7;
    case "slow":
      return 0.85;
    case "fast":
      return 1.2;
    default:
      return 1.0;
  }
}

function buildOpenAiInstructions(language: TTSLanguage): string | undefined {
  switch (language) {
    case "zh-HK":
    case "cantonese":
      return "Speak in Cantonese (Hong Kong). Pronounce any English words naturally in English, then continue in Cantonese.";
    case "zh-CN":
    case "mandarin":
    default:
      return "Speak in Mandarin Chinese (Putonghua). Pronounce any English words naturally in English, then continue in Mandarin.";
  }
}

async function synthesizeSpeechOpenAI(
  text: string,
  language: TTSLanguage,
  rate: TTSRate,
): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OpenAI credentials not configured");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TTS_MODEL,
      input: text,
      voice: OPENAI_TTS_VOICE,
      response_format: "mp3",
      speed: mapOpenAiSpeed(rate),
      instructions: buildOpenAiInstructions(language),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI TTS error:", response.status, errorText);
    throw new Error("OpenAI TTS error");
  }

  return Buffer.from(await response.arrayBuffer());
}

/**
 * POST /api/tts
 *
 * Synthesize speech from text using Azure TTS REST API.
 * Accepts JSON body with text, language, optional rate and phoneme.
 * Returns binary MP3 audio with Redis cache-aside pattern.
 *
 * Flow: auth -> rate limit -> validate -> cache check -> Azure TTS -> cache set -> return MP3
 */
export async function POST(request: NextRequest) {
  // 1. Auth: verify user is authenticated
  const { userId, sessionClaims } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Rate limiting with role-based elevation
  const role =
    (sessionClaims?.metadata as Record<string, unknown>)?.role as string ||
    "student";
  const limiter = selectLimiter(role, ttsLimiter, ttsLimiterElevated);
  const rl = await limiter.limit(userId);
  if (!rl.success) {
    return rateLimitResponse(rl);
  }

  try {
    // 3. Parse and validate request body
    const body = await request.json();
    const { text, phoneme } = body;
    let { language, rate } = body;

    // Validate text
    if (!text || typeof text !== "string" || text.trim().length === 0 || text.length > 500) {
      return NextResponse.json(
        { error: "Text is required (max 500 characters)" },
        { status: 400 }
      );
    }

    // Strip bracketed placeholders like [your name], [location], etc.
    // These are template markers in conversation scripts that shouldn't be spoken.
    const hasBracketedPlaceholders = /\[[^\]]+\]/.test(text);

    // Default and validate language
    if (!language || !VALID_LANGUAGES.includes(language)) {
      language = "zh-CN";
    }

    // Default and validate rate
    if (!rate || !VALID_RATES.includes(rate)) {
      rate = "medium";
    }

    const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
    const hasAzure = Boolean(
      process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_REGION,
    );

    // 4. Resolve provider.
    // Cantonese: providers with an explicit Cantonese mode only —
    //   MiniMax (language_boost "Chinese,Yue" + native Cantonese voice,
    //   preferred when configured) > Azure zh-HK-HiuMaanNeural. ElevenLabs
    //   only via explicit CANTONESE_TTS_PROVIDER opt-in; its auto-detection
    //   produces Mandarin-inflected Cantonese.
    // Mandarin: TTS_PROVIDER env > OpenAI > Azure
    const isCantonese = language === "zh-HK" || language === "cantonese";
    const hasMiniMax = Boolean(process.env.MINIMAX_API_KEY);
    const hasElevenLabs = Boolean(
      process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_CANTONESE_VOICE_ID
    );

    if (!hasOpenAI && !hasAzure && !hasElevenLabs && !hasMiniMax) {
      return NextResponse.json(
        { error: "TTS service not configured" },
        { status: 503 }
      );
    }

    const provider: "openai" | "azure" | "elevenlabs" | "minimax" = (() => {
      if (isCantonese) {
        return resolveCantoneseProvider(process.env);
      }
      if (TTS_PROVIDER === "azure" && hasAzure) return "azure" as const;
      if (hasOpenAI) return "openai" as const;
      return "azure" as const;
    })();

    const voice =
      provider === "minimax"
        ? {
            voiceName: `minimax-${process.env.MINIMAX_CANTONESE_VOICE_ID?.trim() || MINIMAX_DEFAULT_CANTONESE_VOICE}`,
            lang: "zh-HK",
          }
        : provider === "elevenlabs"
          ? { voiceName: `elevenlabs-${process.env.ELEVENLABS_CANTONESE_VOICE_ID}`, lang: "zh-HK" }
          : provider === "azure"
            ? resolveVoice(language)
            : { voiceName: `openai-${OPENAI_TTS_VOICE}`, lang: language as string };

    // 5. Build cache key (includes provider-specific voice identifier)
    const cacheKey = buildCacheKey(text, voice.lang, voice.voiceName, rate);

    // 6. Check Redis cache
    const cached = await redis.get<string>(cacheKey);
    if (cached) {
      const audioBuffer = Buffer.from(cached, "base64");
      return new NextResponse(new Uint8Array(audioBuffer), {
        headers: {
          "Content-Type": "audio/mpeg",
          "Cache-Control": "public, max-age=86400",
          "X-Cache": "HIT",
          // Which provider synthesized this entry (implied by the cache key's
          // voice) — lets the team verify Cantonese is served by the intended
          // provider straight from the browser's network tab.
          "X-TTS-Provider": provider,
        },
      });
    }

    // 7. Preprocess text — replace bracketed placeholders with pauses
    let spokenText = text;
    if (hasBracketedPlaceholders) {
      if (provider === "openai") {
        // OpenAI: replace with ellipsis which creates a natural ~1.5s pause
        spokenText = text.replace(/\[[^\]]+\]/g, "，……，");
      }
      // Azure: handled via SSML break element below
    }

    // 8. Synthesize via selected provider only (no per-request provider mixing)
    if (isCantonese) {
      // Cantonese quality regressions have bitten twice — keep an explicit
      // trail of which provider/voice served each fresh synthesis.
      console.log(
        `TTS: cantonese synthesis via ${provider} (voice=${voice.voiceName}, rate=${rate})`,
      );
    }
    let audioBuffer: Buffer;
    if (provider === "minimax") {
      // MiniMax: no SSML — strip bracketed placeholders to pauses.
      const mmText = hasBracketedPlaceholders
        ? text.replace(/\[[^\]]+\]/g, "，……，")
        : text;
      audioBuffer = await synthesizeSpeechMiniMax(mmText, rate);
    } else if (provider === "elevenlabs") {
      // ElevenLabs: strip brackets for spoken text (no SSML support)
      const elText = hasBracketedPlaceholders
        ? text.replace(/\[[^\]]+\]/g, "，……，")
        : text;
      audioBuffer = await synthesizeSpeechElevenLabs(elText, rate);
    } else if (provider === "openai") {
      audioBuffer = await synthesizeSpeechOpenAI(spokenText, language, rate);
    } else {
      let ssml: string;
      if (hasBracketedPlaceholders && !phoneme) {
        // Azure: build SSML with <break> elements replacing placeholders.
        const parts = text.split(/\[[^\]]+\]/);
        const ssmlText = parts.map((p) => escapeXml(p)).join('<break time="1500ms"/>');
        const ssmlRate = rate === "x-slow" ? "x-slow" : rate === "slow" ? "slow" : rate === "fast" ? "fast" : "medium";
        ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${voice.lang}">
  <voice name="${voice.voiceName}">
    <prosody rate="${ssmlRate}">${ssmlText}</prosody>
  </voice>
</speak>`;
      } else {
        ssml = phoneme
          ? buildPhonemeSSML(spokenText, phoneme, voice.voiceName, voice.lang, rate)
          : buildSSML(spokenText, voice.voiceName, voice.lang, rate);
      }
      audioBuffer = await synthesizeSpeech(ssml);
    }

    // 9. Cache in Redis with tiered TTL
    const ttl = getCacheTTL(text.length);
    await redis.set(cacheKey, audioBuffer.toString("base64"), { ex: ttl });

    // 10. Return MP3 audio
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Cache": "MISS",
        "X-TTS-Provider": provider,
      },
    });
  } catch (error) {
    console.error("TTS API error:", error);

    if (error instanceof Error) {
      if (error.message === "OpenAI credentials not configured") {
        return NextResponse.json(
          { error: "TTS service not configured" },
          { status: 503 }
        );
      }
      if (
        error.message === "TTS request timed out" ||
        error.message === "MiniMax TTS request timed out" ||
        error.message === "ElevenLabs TTS request timed out"
      ) {
        return NextResponse.json(
          { error: "TTS request timed out" },
          { status: 504 }
        );
      }
      if (
        error.message.startsWith("Azure TTS error:") ||
        error.message.startsWith("MiniMax TTS error:") ||
        error.message.startsWith("ElevenLabs TTS error:") ||
        error.message === "OpenAI TTS error"
      ) {
        return NextResponse.json(
          { error: "TTS service unavailable" },
          { status: 502 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate speech" },
      { status: 500 }
    );
  }
}
