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

export type HeaderCredentialState =
  | "missing"
  | "empty"
  | "contains-whitespace"
  | "usable";

/** Classify a credential without exposing its value, length, or format. */
export function getHeaderCredentialState(
  value: string | undefined,
): HeaderCredentialState {
  if (value === undefined) return "missing";
  const credential = value.trim();
  if (!credential) return "empty";
  if (/\s/.test(credential)) return "contains-whitespace";
  return "usable";
}

/** Return a header-safe credential without ever logging its value. */
export function getHeaderCredential(value: string | undefined): string | null {
  if (getHeaderCredentialState(value) !== "usable") return null;
  return value!.trim();
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

// --- Cantonese voice contract ---

/** User-approved production provider. Do not substitute another accent. */
export const APPROVED_CANTONESE_PROVIDER = "minimax" as const;
export type CantoneseProvider = typeof APPROVED_CANTONESE_PROVIDER;

/**
 * Return the only approved Cantonese provider.
 *
 * This is intentionally not configurable. If MiniMax is unavailable, callers
 * must pause Cantonese synthesis instead of substituting Azure, ElevenLabs,
 * OpenAI, or a browser/device voice.
 */
export function resolveCantoneseProvider(): CantoneseProvider {
  return APPROVED_CANTONESE_PROVIDER;
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
  // v7: only audio produced by the locked, user-approved MiniMax Cantonese
  // voice contract may be served. Older provider/voice/model variants stay
  // unreachable even if they used the same text and rate.
  const hash = createHash("md5").update(text).digest("hex");
  return `tts:v7:${language}:${voice}:${rate}:${hash}`;
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

/** User-approved best Cantonese voice contract. Keep these code-locked. */
export const APPROVED_CANTONESE_VOICE_ID = "Cantonese_GentleLady";
export const APPROVED_CANTONESE_TTS_MODEL = "speech-02-hd";

/**
 * Call MiniMax T2A v2 to synthesize Cantonese speech.
 *
 * Unlike ElevenLabs, MiniMax has an explicit Cantonese mode: the request
 * pins `language_boost: "Chinese,Yue"` so the engine never guesses the
 * language from the text. The model and native Cantonese voice are locked to
 * the user-approved production combination. Returns raw MP3 audio as a Buffer
 * (MiniMax responds with
 * hex-encoded audio inside JSON).
 *
 * Env:
 * - MINIMAX_API_KEY (required)
 * - MINIMAX_GROUP_ID (optional; appended as ?GroupId= for accounts that
 *   require it)
 */
export async function synthesizeSpeechMiniMax(
  text: string,
  rate: TTSRate = "medium",
): Promise<Buffer> {
  const apiKey = getHeaderCredential(process.env.MINIMAX_API_KEY);
  if (!apiKey) {
    throw new Error("MiniMax credentials not configured");
  }

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
        model: APPROVED_CANTONESE_TTS_MODEL,
        text,
        stream: false,
        // Pin Cantonese explicitly — this is the whole point of using MiniMax.
        language_boost: "Chinese,Yue",
        voice_setting: {
          voice_id: APPROVED_CANTONESE_VOICE_ID,
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
    console.error(
      "MiniMax TTS request failed:",
      error instanceof Error ? error.name : "UnknownError",
    );
    throw new Error("MiniMax TTS error: network request failed");
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

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("MiniMax TTS error: invalid response");
  }
  const responseBody = payload as {
    data?: { audio?: unknown } | null;
    base_resp?: { status_code?: number | string; status_msg?: string } | null;
  };

  const statusCode = Number(responseBody.base_resp?.status_code);
  if (statusCode !== 0) {
    const msg = responseBody.base_resp?.status_msg || "unknown error";
    console.error(`MiniMax TTS: API status ${statusCode}: ${msg}`);
    throw new Error(`MiniMax TTS error: ${statusCode} — ${msg}`);
  }

  const hexAudio = responseBody.data?.audio;
  if (
    typeof hexAudio !== "string" ||
    hexAudio.length === 0 ||
    hexAudio.length % 2 !== 0 ||
    !/^[0-9a-fA-F]+$/.test(hexAudio)
  ) {
    throw new Error("MiniMax TTS error: response contained no audio");
  }

  return Buffer.from(hexAudio, "hex");
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
  const key = getHeaderCredential(process.env.AZURE_SPEECH_KEY);
  const region = process.env.AZURE_SPEECH_REGION?.trim();
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
