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

// --- SSML Builders ---

/**
 * Build SSML string with prosody rate control.
 *
 * Uses SSML version 1.0 with the W3C synthesis namespace.
 * Wraps text in <voice> and <prosody rate="..."> elements.
 */
export function buildSSML(
  text: string,
  voiceName: string,
  lang: string,
  rate: string = "medium"
): string {
  const ssmlRate = toSsmlRate(rate);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">
  <voice name="${voiceName}">
    <prosody rate="${ssmlRate}">${escapeXml(text)}</prosody>
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
  // v2: bust cache after placeholder pause fix
  const hash = createHash("md5").update(text).digest("hex");
  return `tts:v2:${language}:${voice}:${rate}:${hash}`;
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
  const speed = rate === "x-slow" ? 0.6 : rate === "slow" ? 0.8 : rate === "fast" ? 1.3 : 1.0;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(
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
          model_id: "eleven_multilingual_v2",
          language_code: "yue",
          voice_settings: { stability, similarity_boost: similarityBoost, speed },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ElevenLabs TTS: API error ${response.status}:`, errorText);
      throw new Error(`ElevenLabs TTS error: ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    clearTimeout(timeoutId);
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
