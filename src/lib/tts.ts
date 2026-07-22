// src/lib/tts.ts
// Azure Text-to-Speech REST API — SSML builder, voice resolver, cache logic
// ============================================================
// Builds SSML strings for Azure TTS, resolves language-to-voice mapping,
// constructs deterministic cache keys, and calls the Azure TTS REST API.
//
// Endpoint: https://{region}.tts.speech.microsoft.com/cognitiveservices/v1
// Docs: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech

import { createHash } from "crypto";

// --- Types ---

export type TTSLanguage = "zh-CN" | "zh-HK" | "mandarin" | "cantonese";

export type TTSRate = "x-slow" | "slow" | "medium" | "fast";

export interface TTSRequest {
  text: string;
  language: TTSLanguage;
  rate?: TTSRate;
  phoneme?: string;
}

// --- Voice Resolution ---

interface VoiceInfo {
  voiceName: string;
  lang: string;
}

/** Convert logical app rate presets into explicit SSML percentages. */
function toSsmlRate(rate: string): string {
  switch (rate) {
    case "x-slow":
      return "60%";
    case "slow":
      return "80%";
    case "fast":
      return "140%";
    default:
      return "100%";
  }
}

/**
 * Map language identifier to Azure TTS voice name and locale.
 *
 * Standard neural voices only (NOT HD) — HD voices lack prosody/break
 * support which is critical for language learning rate control.
 */
export function resolveVoice(language: string): VoiceInfo {
  switch (language) {
    case "zh-HK":
    case "cantonese":
      return { voiceName: "zh-HK-HiuMaanNeural", lang: "zh-HK" };
    case "zh-CN":
    case "mandarin":
    default:
      return { voiceName: "zh-CN-XiaoxiaoNeural", lang: "zh-CN" };
  }
}

// --- Cantonese provider resolution ---

export type CantoneseProvider = "minimax" | "azure" | "elevenlabs" | "openai";

export interface CantoneseProviderEnv {
  MINIMAX_API_KEY?: string;
  AZURE_SPEECH_KEY?: string;
  AZURE_SPEECH_REGION?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_CANTONESE_VOICE_ID?: string;
  CANTONESE_TTS_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  // Allows passing process.env directly.
  [key: string]: string | undefined;
}

/**
 * Decide which provider synthesizes Cantonese audio.
 *
 * Only providers with an EXPLICIT Cantonese mode are ever chosen by default:
 *
 * - MiniMax (preferred when configured): T2A v2 with
 *   `language_boost: "Chinese,Yue"` plus native Cantonese preset voices —
 *   the language is pinned per request, never guessed from the text.
 * - Azure zh-HK-HiuMaanNeural: a dedicated Cantonese (Hong Kong) locale
 *   voice; also the only provider supporting jyutping phoneme
 *   disambiguation and true SSML rate control.
 *
 * ElevenLabs has no Cantonese TTS language code ("yue" is speech-to-text
 * only), so its models auto-detect the language from text — which drifts
 * into a Mandarin-inflected accent, especially on short words and single
 * characters. That accent drift is exactly the "audio sounds weird"
 * regression this resolver exists to prevent, so ElevenLabs must be opted
 * into explicitly with CANTONESE_TTS_PROVIDER=elevenlabs. OpenAI is the
 * last-resort fallback when nothing else is configured.
 */
export function resolveCantoneseProvider(
  env: CantoneseProviderEnv = process.env,
): CantoneseProvider {
  const hasMiniMax = Boolean(env.MINIMAX_API_KEY);
  const hasAzure = Boolean(env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION);
  const hasElevenLabs = Boolean(
    env.ELEVENLABS_API_KEY && env.ELEVENLABS_CANTONESE_VOICE_ID,
  );
  const preference = (env.CANTONESE_TTS_PROVIDER || "").trim().toLowerCase();

  if (preference === "minimax" && hasMiniMax) return "minimax";
  if (preference === "elevenlabs" && hasElevenLabs) return "elevenlabs";
  if (preference === "azure" && hasAzure) return "azure";

  if (hasMiniMax) return "minimax";
  if (hasAzure) return "azure";
  if (hasElevenLabs) return "elevenlabs";
  return "openai";
}

// --- XML Escaping ---

/**
 * Escape XML special characters for safe embedding in SSML.
 *
 * Order matters: escape `&` first to avoid double-escaping entities
 * already present in the text.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// --- Mixed-language helpers ---

/**
 * Wrap English segments in SSML <lang> tags so Azure switches to an English
 * voice instead of forcing the Chinese voice to pronounce English words.
 * Bracketed placeholders are replaced with <break> pauses.
 */
function mixedLangSsml(text: string): string {
  // Split into: bracketed placeholders, English runs, or everything else
  const parts = text.match(
    /\[[^\]]+\]|[a-zA-Z][a-zA-Z0-9' ]*[a-zA-Z0-9]|[a-zA-Z]|[^\[\]a-zA-Z]+/g,
  );
  if (!parts) return escapeXml(text);

  return parts
    .map((seg) => {
      if (/^\[/.test(seg)) return '<break time="1500ms"/>';
      if (/^[a-zA-Z]/.test(seg))
        return `<lang xml:lang="en-US">${escapeXml(seg)}</lang>`;
      return escapeXml(seg);
    })
    .join("");
}

/** Check if text contains English letters (names, loanwords, etc.) */
function hasEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

// --- SSML Builders ---

/**
 * Build SSML string with prosody rate control.
 *
 * Uses SSML version 1.0 with the W3C synthesis namespace.
 * Wraps text in <voice> and <prosody rate="..."> elements.
 * English words are wrapped in <lang xml:lang="en-US"> for natural pronunciation.
 */
export function buildSSML(
  text: string,
  voiceName: string,
  lang: string,
  rate: string = "medium"
): string {
  const ssmlRate = toSsmlRate(rate);
  const body = hasEnglish(text) ? mixedLangSsml(text) : escapeXml(text);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${ssmlRate}">${body}</prosody>
  </voice>
</speak>`;
}

/**
 * Build SSML string with phoneme annotation for polyphonic character disambiguation.
 *
 * Wraps text in <phoneme alphabet="sapi" ph="..."> inside the prosody tag.
 * The phoneme parameter accepts pinyin tone numbers (Mandarin) or jyutping (Cantonese).
 *
 * Example: buildPhonemeSSML("行", "hang2", voice, lang, "medium")
 * forces the "hang2" reading instead of the default "xing2".
 */
export function buildPhonemeSSML(
  text: string,
  phoneme: string,
  voiceName: string,
  lang: string,
  rate: string = "medium"
): string {
  const ssmlRate = toSsmlRate(rate);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${ssmlRate}">
      <phoneme alphabet="sapi" ph="${escapeXml(phoneme)}">${escapeXml(text)}</phoneme>
    </prosody>
  </voice>
</speak>`;
}

// --- Cache Key & TTL ---

/**
 * Build a deterministic Redis cache key for a TTS request.
 *
 * Format: tts:{language}:{voice}:{rate}:{md5(text)}
 * Uses MD5 hash of the text to keep keys short and avoid special characters.
 */
export function buildCacheKey(
  text: string,
  language: string,
  voice: string,
  rate: string
): string {
  // v6: bust cache after moving Cantonese back to Azure zh-HK-HiuMaanNeural —
  // entries generated while ElevenLabs multilingual_v2 auto-detection was the
  // default contain Mandarin-inflected ("weird-sounding") Cantonese audio.
  const hash = createHash("md5").update(text).digest("hex");
  return `tts:v6:${language}:${voice}:${rate}:${hash}`;
}

/**
 * Return cache TTL in seconds based on text length.
 *
 * Shorter text (single characters, 2-char words) has higher reuse across
 * students and sessions, so it gets a longer TTL. Sentences are more unique
 * and larger, so they expire sooner.
 *
 * | Text Length | TTL        | Rationale                              |
 * |-------------|------------|----------------------------------------|
 * | 1-2 chars   | 7 days     | High reuse, tiny size (~8KB base64)    |
 * | 3-6 chars   | 3 days     | Moderate reuse for compound words      |
 * | 7+ chars    | 24 hours   | Lower reuse for sentences, larger size |
 */
export function getCacheTTL(textLength: number): number {
  if (textLength <= 2) return 604800; // 7 days
  if (textLength <= 6) return 259200; // 3 days
  return 86400; // 24 hours
}

// --- MiniMax TTS REST API ---

/** Default native-Cantonese preset voice for MiniMax T2A. */
export const MINIMAX_DEFAULT_CANTONESE_VOICE = "Cantonese_GentleLady";

/**
 * Call MiniMax T2A v2 to synthesize Cantonese speech.
 *
 * Unlike ElevenLabs, MiniMax has an explicit Cantonese mode: the request
 * pins `language_boost: "Chinese,Yue"` so the engine never guesses the
 * language from the text, and the default voice is a native Cantonese
 * preset. Returns raw MP3 audio as a Buffer (MiniMax responds with
 * hex-encoded audio inside JSON).
 *
 * Env:
 * - MINIMAX_API_KEY (required)
 * - MINIMAX_GROUP_ID (optional; appended as ?GroupId= for accounts that
 *   require it)
 * - MINIMAX_CANTONESE_VOICE_ID (optional, default Cantonese_GentleLady)
 * - MINIMAX_TTS_MODEL (optional, default speech-02-hd)
 */
export async function synthesizeSpeechMiniMax(
  text: string,
  rate: TTSRate = "medium",
): Promise<Buffer> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MiniMax credentials not configured");
  }

  const voiceId =
    process.env.MINIMAX_CANTONESE_VOICE_ID?.trim() ||
    MINIMAX_DEFAULT_CANTONESE_VOICE;
  const model = process.env.MINIMAX_TTS_MODEL?.trim() || "speech-02-hd";
  const groupId = process.env.MINIMAX_GROUP_ID?.trim() || "";
  const url = `https://api.minimax.io/v1/t2a_v2${groupId ? `?GroupId=${encodeURIComponent(groupId)}` : ""}`;

  // MiniMax speed range is [0.5, 2] — the app's rate presets fit as-is.
  const speed =
    rate === "x-slow" ? 0.6 : rate === "slow" ? 0.8 : rate === "fast" ? 1.3 : 1.0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        text,
        stream: false,
        // Pin Cantonese explicitly — this is the whole point of using MiniMax.
        language_boost: "Chinese,Yue",
        voice_setting: {
          voice_id: voiceId,
          speed,
          vol: 1.0,
          pitch: 0,
        },
        audio_setting: {
          format: "mp3",
          sample_rate: 32000,
          bitrate: 128000,
          channel: 1,
        },
      }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("MiniMax TTS request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const snippet = errorText.slice(0, 300).replace(/\s+/g, " ").trim();
    console.error(`MiniMax TTS: HTTP ${response.status}:`, snippet);
    throw new Error(
      `MiniMax TTS error: ${response.status}${snippet ? ` — ${snippet}` : ""}`,
    );
  }

  const payload = (await response.json()) as {
    data?: { audio?: string };
    base_resp?: { status_code?: number; status_msg?: string };
  };

  const statusCode = payload.base_resp?.status_code;
  if (statusCode !== 0) {
    const msg = payload.base_resp?.status_msg || "unknown error";
    console.error(`MiniMax TTS: API status ${statusCode}: ${msg}`);
    throw new Error(`MiniMax TTS error: ${statusCode} — ${msg}`);
  }

  const hexAudio = payload.data?.audio;
  if (!hexAudio || !/^[0-9a-fA-F]+$/.test(hexAudio)) {
    throw new Error("MiniMax TTS error: response contained no audio");
  }

  return Buffer.from(hexAudio, "hex");
}

// --- ElevenLabs TTS REST API ---

/**
 * Call ElevenLabs TTS API to synthesize speech.
 * Uses the voice ID configured in ELEVENLABS_CANTONESE_VOICE_ID.
 * Returns raw MP3 audio as a Buffer.
 */
export async function synthesizeSpeechElevenLabs(
  text: string,
  rate: TTSRate = "medium"
): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_CANTONESE_VOICE_ID;
  if (!apiKey || !voiceId) {
    throw new Error("ElevenLabs credentials not configured");
  }

  const stability = 0.5;
  const similarityBoost = 0.75;
  // ElevenLabs only accepts voice_settings.speed in [0.7, 1.2] — 0.6/1.3
  // (our old x-slow/fast values) are rejected by the API.
  const speed = rate === "x-slow" ? 0.7 : rate === "slow" ? 0.8 : rate === "fast" ? 1.2 : 1.0;

  // Cantonese TTS: ElevenLabs' Multilingual v2 model auto-detects the language
  // from the text and, paired with a Cantonese voice, renders Cantonese. The
  // turbo/flash v2.5 models accept a `language_code`, but their TTS language
  // list does NOT include Cantonese ("yue") — sending it 400s the request.
  // ("yue" is only a valid code for ElevenLabs' speech-to-TEXT models.) So we
  // do not send a language_code by default. Both the model and, if a supported
  // combination ever exists, the language code are overridable via env.
  const modelId = process.env.ELEVENLABS_CANTONESE_MODEL || "eleven_multilingual_v2";
  const configuredLanguageCode =
    process.env.ELEVENLABS_CANTONESE_LANGUAGE_CODE?.trim() || "";
  const modelSupportsLanguageCode = /v2_5|flash|_v3/i.test(modelId);
  const languageCode = modelSupportsLanguageCode ? configuredLanguageCode : "";

  const callElevenLabs = async (withLanguageCode: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      return await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: {
            "xi-api-key": apiKey,
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
          body: JSON.stringify({
            text,
            model_id: modelId,
            ...(withLanguageCode ? { language_code: withLanguageCode } : {}),
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              speed,
            },
          }),
          signal: controller.signal,
        },
      );
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    let response = await callElevenLabs(languageCode);

    if (!response.ok) {
      const errorText = await response.text();
      // Self-heal: if ElevenLabs rejects the language_code for this model,
      // retry once without it so Cantonese TTS falls back to auto-detection
      // instead of hard-failing.
      if (languageCode && response.status === 400 && /language_code/i.test(errorText)) {
        console.warn(
          `ElevenLabs TTS: model "${modelId}" rejected language_code "${languageCode}", retrying without it`,
        );
        response = await callElevenLabs("");
        if (response.ok) {
          return Buffer.from(await response.arrayBuffer());
        }
        const retryText = await response.text();
        console.error(`ElevenLabs TTS: API error ${response.status}:`, retryText);
        const retrySnippet = retryText.slice(0, 300).replace(/\s+/g, " ").trim();
        throw new Error(
          `ElevenLabs TTS error: ${response.status}${retrySnippet ? ` — ${retrySnippet}` : ""}`,
        );
      }

      console.error(`ElevenLabs TTS: API error ${response.status}:`, errorText);
      // Include a snippet of the response body so callers can diagnose.
      const snippet = errorText.slice(0, 300).replace(/\s+/g, " ").trim();
      throw new Error(
        `ElevenLabs TTS error: ${response.status}${snippet ? ` — ${snippet}` : ""}`,
      );
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("ElevenLabs TTS request timed out");
    }
    throw error;
  }
}

// --- Azure TTS REST API ---

/**
 * Call Azure TTS REST API to synthesize speech from SSML.
 *
 * Sends SSML to Azure and returns raw MP3 audio as a Buffer.
 * Uses the same AZURE_SPEECH_KEY and AZURE_SPEECH_REGION env vars
 * as the pronunciation assessment in src/lib/pronunciation.ts.
 *
 * Output format: audio-24khz-48kbitrate-mono-mp3
 * - 24kHz mono MP3 at 48kbps provides clear speech at minimal file size
 * - Universally supported by all browsers via Audio API
 *
 * @param ssml - Complete SSML string (from buildSSML or buildPhonemeSSML)
 * @returns Buffer containing MP3 audio data
 * @throws Error if Azure credentials are missing, request times out, or API returns error
 */
export async function synthesizeSpeech(ssml: string): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) {
    throw new Error("Azure Speech credentials not configured");
  }

  const url = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;

  // 5-second timeout via AbortController (TTS is fast, typically <300ms)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "CantoMandoBlueprint",
      },
      body: ssml,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `Azure TTS: API error ${response.status}:`,
        errorText
      );
      throw new Error(`Azure TTS error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === "AbortError") {
      console.error("Azure TTS: Request timed out after 5 seconds");
      throw new Error("TTS request timed out");
    }
    // Re-throw if it's already our error
    if (
      error instanceof Error &&
      (error.message.startsWith("Azure TTS error:") ||
        error.message === "TTS request timed out" ||
        error.message === "Azure Speech credentials not configured")
    ) {
      throw error;
    }
    // Log and re-throw unexpected errors
    console.error("Azure TTS: Unexpected error:", error);
    throw new Error(
      `Azure TTS error: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
