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
  getHeaderCredential,
  MINIMAX_DEFAULT_CANTONESE_VOICE,
} from "@/lib/tts";
import type { TTSLanguage, TTSRate } from "@/lib/tts";

// Audio caching is optional. A missing or unhealthy cache must never take TTS
// down; rate limiting has its own durable Neon fallback.
let redis: Redis | null = null;
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  try {
    redis = Redis.fromEnv();
  } catch (error) {
    console.warn(
      "Redis init failed in TTS route; bypassing cache:",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
}

const VALID_LANGUAGES: TTSLanguage[] = ["zh-CN", "zh-HK", "mandarin", "cantonese"];
const VALID_RATES: TTSRate[] = ["x-slow", "slow", "medium", "fast"];
const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
const OPENAI_TTS_VOICE = "alloy";
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "").toLowerCase();
let warnedAboutCacheFailure = false;

function warnCacheFailure(error: unknown): void {
  if (warnedAboutCacheFailure) return;
  warnedAboutCacheFailure = true;
  console.warn(
    "TTS cache unavailable; bypassing cache:",
    error instanceof Error ? error.name : "UnknownError",
  );
}

async function readCachedAudio(cacheKey: string): Promise<Buffer | null> {
  if (!redis) return null;
  try {
    const cached = await redis.get<string>(cacheKey);
    return cached ? Buffer.from(cached, "base64") : null;
  } catch (error) {
    warnCacheFailure(error);
    return null;
  }
}

async function writeCachedAudio(
  cacheKey: string,
  audioBuffer: Buffer,
  ttl: number,
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(cacheKey, audioBuffer.toString("base64"), { ex: ttl });
  } catch (error) {
    warnCacheFailure(error);
  }
}

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
  const apiKey = getHeaderCredential(process.env.OPENAI_API_KEY);
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

    const hasOpenAI = Boolean(
      getHeaderCredential(process.env.OPENAI_API_KEY),
    );
    const hasAzure = Boolean(
      getHeaderCredential(process.env.AZURE_SPEECH_KEY) &&
        process.env.AZURE_SPEECH_REGION?.trim(),
    );

    // 4. Resolve provider.
    // Cantonese: providers with an explicit Cantonese mode only —
    //   MiniMax (language_boost "Chinese,Yue" + native Cantonese voice,
    //   preferred when configured) > Azure zh-HK-HiuMaanNeural. ElevenLabs
    //   only via explicit CANTONESE_TTS_PROVIDER opt-in; its auto-detection
    //   produces Mandarin-inflected Cantonese.
    // Mandarin: TTS_PROVIDER env > OpenAI > Azure
    const isCantonese = language === "zh-HK" || language === "cantonese";
    const hasMiniMax = Boolean(
      getHeaderCredential(process.env.MINIMAX_API_KEY),
    );
    const hasElevenLabs = Boolean(
      getHeaderCredential(process.env.ELEVENLABS_API_KEY) &&
        process.env.ELEVENLABS_CANTONESE_VOICE_ID?.trim()
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
    const cachedAudio = await readCachedAudio(cacheKey);
    if (cachedAudio) {
      return new NextResponse(new Uint8Array(cachedAudio), {
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

    // 7. Preprocess text — non-SSML providers use punctuation as a pause.
    const plainSpokenText = hasBracketedPlaceholders
      ? text.replace(/\[[^\]]+\]/g, "，……，")
      : text;
    const spokenText = provider === "openai" ? plainSpokenText : text;

    // 8. Synthesize. MiniMax is the Cantonese-quality primary; if its network
    // path fails, OpenAI receives an explicit Hong Kong Cantonese instruction
    // so students still get audio instead of a dead request.
    if (isCantonese) {
      // Cantonese quality regressions have bitten twice — keep an explicit
      // trail of which provider/voice served each fresh synthesis, plus which
      // provider credentials the runtime can actually see (names only). When
      // the wrong provider serves, this line says whether it's a code problem
      // or an env-var problem (missing/typo'd/wrong-environment key).
      console.log(
        `TTS: cantonese synthesis via ${provider} (voice=${voice.voiceName}, rate=${rate}) ` +
          `[configured: minimax=${hasMiniMax} azure=${hasAzure} elevenlabs=${hasElevenLabs} openai=${hasOpenAI}]`,
      );
    }
    let servedProvider = provider;
    let servedVoice = voice;
    let audioBuffer: Buffer;
    if (provider === "minimax") {
      try {
        audioBuffer = await synthesizeSpeechMiniMax(plainSpokenText, rate);
      } catch (error) {
        if (!hasOpenAI) throw error;
        console.warn(
          "TTS: MiniMax failed; using instructed Cantonese OpenAI fallback:",
          error instanceof Error ? error.name : "UnknownError",
        );
        servedProvider = "openai";
        servedVoice = {
          voiceName: `openai-${OPENAI_TTS_VOICE}`,
          lang: "zh-HK",
        };
        audioBuffer = await synthesizeSpeechOpenAI(
          plainSpokenText,
          language,
          rate,
        );
      }
    } else if (provider === "elevenlabs") {
      audioBuffer = await synthesizeSpeechElevenLabs(plainSpokenText, rate);
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

    // 9. Cache under the provider that actually served the audio. This avoids
    // poisoning a MiniMax cache key with fallback audio.
    const ttl = getCacheTTL(text.length);
    const servedCacheKey = buildCacheKey(
      text,
      servedVoice.lang,
      servedVoice.voiceName,
      rate,
    );
    await writeCachedAudio(servedCacheKey, audioBuffer, ttl);

    // 10. Return MP3 audio
    return new NextResponse(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=86400",
        "X-Cache": redis ? "MISS" : "BYPASS",
        "X-TTS-Provider": servedProvider,
      },
    });
  } catch (error) {
    // Do not log arbitrary fetch error messages here. Node includes invalid
    // header values verbatim, which can expose provider credentials.
    console.error(
      "TTS API error:",
      error instanceof Error ? error.name : "UnknownError",
    );

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
