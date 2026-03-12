import { parse } from "@plussub/srt-vtt-parser";
import { detect } from "jschardet";
import { getSubtitles } from "youtube-caption-extractor";

// ============================================================
// Types
// ============================================================

export interface NormalizedCaption {
  text: string;
  startMs: number;
  endMs: number;
  sequence: number;
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

interface TranslationLanguage {
  languageCode: string;
  languageName?: { simpleText?: string };
}

// ============================================================
// Constants
// ============================================================

/** Chinese language codes to match, in priority order */
const CHINESE_LANG_CODES = [
  "zh-CN",
  "zh-TW",
  "zh-Hant",
  "zh-Hans",
  "zh-HK",
  "zh-SG",
  "zh-MO",
  "zh",
  "yue",
  "yue-HK",
];

/** English language codes to match, in priority order */
const ENGLISH_LANG_CODES = ["en", "en-US", "en-GB"];

/**
 * Map jschardet encoding names to TextDecoder-compatible labels.
 * jschardet returns names like "GB2312" but TextDecoder uses WHATWG labels.
 */
export const ENCODING_MAP: Record<string, string> = {
  GB2312: "gbk",
  GBK: "gbk",
  GB18030: "gb18030",
  Big5: "big5",
  "UTF-8": "utf-8",
  ASCII: "utf-8",
  "windows-1252": "utf-8", // fallback for misdetection
  "EUC-TW": "utf-8", // fallback — rare encoding
  "HZ-GB-2312": "utf-8", // fallback — rare encoding
  "ISO-2022-CN": "utf-8", // fallback — rare encoding
};

/** CJK Unified Ideographs range check */
const CJK_REGEX = /[\u4e00-\u9fff]/;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ============================================================
// Caption Track Discovery — Page Scraping (primary)
// ============================================================

/**
 * Scrape the YouTube watch page HTML and extract caption track data
 * from the embedded `ytInitialPlayerResponse`. This is the most reliable
 * method because the page always includes track metadata even when
 * InnerTube API clients are blocked.
 */
async function fetchCaptionTrackDataViaPageScrape(videoId: string): Promise<{
  tracks: CaptionTrack[];
  translationLanguages: TranslationLanguage[];
}> {
  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      "User-Agent": BROWSER_UA,
      "Accept-Language": "en-US,en;q=0.9",
      Cookie: "CONSENT=YES+cb.20210420-17-p0.en+FX+987",
    },
  });
  const html = await res.text();

  // Extract ytInitialPlayerResponse JSON
  const playerMatch = html.match(
    /ytInitialPlayerResponse\s*=\s*({[\s\S]+?});\s*<\/script>/
  );
  if (!playerMatch) {
    return { tracks: [], translationLanguages: [] };
  }

  const data = JSON.parse(playerMatch[1]);
  const tracklist = data?.captions?.playerCaptionsTracklistRenderer;
  return {
    tracks: tracklist?.captionTracks || [],
    translationLanguages: tracklist?.translationLanguages || [],
  };
}

// ============================================================
// XML Parsing — handles both srv1 and srv3 formats
// ============================================================

/**
 * Decode common XML entities to plain text.
 */
function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]*>/g, "")
    .trim();
}

/**
 * Parse YouTube's timedtext XML into NormalizedCaption[].
 *
 * Supports two formats:
 *  - srv3 (format 3): `<p t="ms" d="ms">text</p>` — times in milliseconds
 *  - srv1 (default):  `<text start="s" dur="s">text</text>` — times in seconds
 */
function parseTimedTextXml(xml: string): NormalizedCaption[] {
  if (!xml || xml.trim().length === 0) return [];

  const captions: NormalizedCaption[] = [];
  let seq = 1;

  // Try srv3 format first: <p t="ms" d="ms">text</p>
  const srv3Regex = /<p t="(\d+)" d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g;
  let match;
  while ((match = srv3Regex.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[3]);
    if (text) {
      const startMs = parseInt(match[1], 10);
      const durMs = parseInt(match[2], 10);
      captions.push({ text, startMs, endMs: startMs + durMs, sequence: seq++ });
    }
  }
  if (captions.length > 0) return captions;

  // Try srv1 format: <text start="seconds" dur="seconds">text</text>
  const srv1Regex = /<text start="([^"]*)" dur="([^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  while ((match = srv1Regex.exec(xml)) !== null) {
    const text = decodeXmlEntities(match[3]);
    if (text) {
      const startMs = Math.round(parseFloat(match[1]) * 1000);
      const durMs = Math.round(parseFloat(match[2]) * 1000);
      captions.push({ text, startMs, endMs: startMs + durMs, sequence: seq++ });
    }
  }

  return captions;
}

// ============================================================
// Track Matching
// ============================================================

/**
 * Find the first matching caption track for a list of language codes.
 */
function findTrack(
  tracks: CaptionTrack[],
  langCodes: string[]
): CaptionTrack | null {
  const exactSet = new Set(langCodes.map((lang) => lang.toLowerCase()));
  const exact = tracks.find((t) =>
    exactSet.has((t.languageCode || "").toLowerCase())
  );
  if (exact) return exact;

  // Handle regional and variant codes like zh-HK, zh-Hans-US, yue-Hant.
  const prefix = tracks.find((t) => {
    const code = (t.languageCode || "").toLowerCase();
    return (
      code.startsWith("zh") ||
      code.startsWith("yue") ||
      code.startsWith("cmn")
    );
  });
  if (prefix) return prefix;

  // Last resort: language name hints.
  const byName = tracks.find((t) => {
    const name = (t.name?.simpleText || "").toLowerCase();
    return (
      name.includes("chinese") ||
      name.includes("mandarin") ||
      name.includes("cantonese") ||
      name.includes("中文") ||
      name.includes("普通話") ||
      name.includes("国语") ||
      name.includes("國語") ||
      name.includes("粵語") ||
      name.includes("粤语")
    );
  });
  if (byName) return byName;

  for (const lang of langCodes) {
    const track = tracks.find((t) => t.languageCode === lang);
    if (track) return track;
  }
  return null;
}

function canTranslateToChinese(
  translationLanguages: TranslationLanguage[]
): boolean {
  return translationLanguages.some((lang) => {
    const code = (lang.languageCode || "").toLowerCase();
    return (
      code.startsWith("zh") ||
      code.startsWith("yue") ||
      code.startsWith("cmn")
    );
  });
}

function buildTranslatedTrack(
  track: CaptionTrack,
  targetLang = "zh-Hans"
): CaptionTrack {
  const url = new URL(track.baseUrl);
  url.searchParams.set("tlang", targetLang);
  return { ...track, baseUrl: url.toString(), languageCode: targetLang };
}

// ============================================================
// Caption Content Fetching
// ============================================================

/**
 * Fetch and parse captions from a track URL.
 * Tries both default and srv3 format.
 */
async function fetchAndParseCaptions(
  track: CaptionTrack
): Promise<NormalizedCaption[]> {
  // Try default format first
  const res = await fetch(track.baseUrl, {
    headers: { "User-Agent": BROWSER_UA },
  });
  const xml = await res.text();
  const captions = parseTimedTextXml(xml);
  if (captions.length > 0) return captions;

  // If empty, try forcing srv3 format
  const url = new URL(track.baseUrl);
  if (!url.searchParams.has("fmt")) {
    url.searchParams.set("fmt", "srv3");
    const srv3Res = await fetch(url.toString(), {
      headers: { "User-Agent": BROWSER_UA },
    });
    const srv3Xml = await srv3Res.text();
    const srv3Captions = parseTimedTextXml(srv3Xml);
    if (srv3Captions.length > 0) return srv3Captions;
  }

  return [];
}

async function extractViaCaptionExtractor(
  videoId: string,
  languages: string[]
): Promise<{ captions: NormalizedCaption[]; lang: string } | null> {
  for (const lang of languages) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang });
      if (!subtitles || subtitles.length === 0) continue;
      const captions: NormalizedCaption[] = subtitles
        .map((line, index) => {
          const startMs = Math.max(
            0,
            Math.round(Number.parseFloat(line.start || "0") * 1000)
          );
          const durationMs = Math.max(
            0,
            Math.round(Number.parseFloat(line.dur || "0") * 1000)
          );
          return {
            text: (line.text || "").trim(),
            startMs,
            endMs: startMs + durationMs,
            sequence: index + 1,
          };
        })
        .filter((line) => line.text.length > 0);
      if (captions.length > 0) {
        return { captions, lang };
      }
    } catch {
      // Try next language.
    }
  }
  return null;
}

// ============================================================
// Supadata API Integration
// ============================================================

interface SupadataCaption {
  text: string;
  offset: number;
  duration: number;
  lang: string;
}

/**
 * Fetch captions via Supadata API (paid service, highly reliable).
 * First tries without lang param (gets default/best available),
 * then tries specific Chinese language codes in priority order.
 * Returns null if API key is not configured or no captions found.
 */
async function fetchViaSupadata(
  videoId: string,
  langCodes: string[]
): Promise<{ captions: NormalizedCaption[]; lang: string } | null> {
  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    console.log("[supadata] No SUPADATA_API_KEY configured, skipping");
    return null;
  }

  // Try each language code, plus a no-lang attempt first to get the default
  const attempts = [...langCodes];

  for (const lang of attempts) {
    try {
      const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&lang=${lang}`;
      console.log(`[supadata] Trying lang=${lang} for video ${videoId}`);
      const res = await fetch(url, {
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.log(`[supadata] lang=${lang} returned ${res.status}: ${errText.slice(0, 200)}`);
        continue;
      }

      const data = await res.json();
      console.log(`[supadata] lang=${lang} response keys:`, Object.keys(data), "availableLangs:", data.availableLangs);

      // content can be an array of caption objects or a string (plain text mode)
      const content = data.content;
      const responseLang = data.lang || lang;

      if (Array.isArray(content) && content.length > 0) {
        const captions: NormalizedCaption[] = content.map((item: SupadataCaption, idx: number) => ({
          text: (item.text || "").trim(),
          startMs: Math.round(item.offset ?? 0),
          endMs: Math.round((item.offset ?? 0) + (item.duration ?? 0)),
          sequence: idx + 1,
        })).filter((c: NormalizedCaption) => c.text.length > 0);

        if (captions.length > 0) {
          console.log(`[supadata] Success: ${captions.length} captions for lang=${responseLang}`);
          return { captions, lang: responseLang };
        }
      } else if (typeof content === "string" && content.trim().length > 0) {
        // Plain text response — split into lines as individual captions
        const lines = content.split("\n").filter((l: string) => l.trim().length > 0);
        const captions: NormalizedCaption[] = lines.map((line: string, idx: number) => ({
          text: line.trim(),
          startMs: 0,
          endMs: 0,
          sequence: idx + 1,
        }));
        if (captions.length > 0) {
          console.log(`[supadata] Success (plain text): ${captions.length} lines for lang=${responseLang}`);
          return { captions, lang: responseLang };
        }
      }
    } catch (err) {
      console.error(`[supadata] Error for lang=${lang}:`, err);
    }
  }
  return null;
}

// ============================================================
// Public Functions
// ============================================================

/**
 * Extract Chinese captions from a YouTube video.
 *
 * Strategy (in order):
 *  1. Supadata API (paid, most reliable — bypasses YouTube blocks)
 *  2. Scrape YouTube page → discover tracks → fetch timedtext XML
 *  3. Translate from available source track to Chinese (if translation available)
 *  4. youtube-caption-extractor fallback
 *
 * @param videoId - YouTube video ID (11 characters)
 * @returns Normalized captions with the language code used, or null if none available
 */
export async function extractChineseCaptions(
  videoId: string
): Promise<{ captions: NormalizedCaption[]; lang: string } | null> {
  // Step 1: Try Supadata API first (bypasses YouTube PO Token blocks)
  const supadataResult = await fetchViaSupadata(videoId, CHINESE_LANG_CODES);
  if (supadataResult) {
    return supadataResult;
  }

  // Step 2: Discover caption tracks via page scraping (fallback)
  let tracks: CaptionTrack[] = [];
  let translationLanguages: TranslationLanguage[] = [];
  try {
    const trackData = await fetchCaptionTrackDataViaPageScrape(videoId);
    tracks = trackData.tracks;
    translationLanguages = trackData.translationLanguages;
  } catch {
    tracks = [];
    translationLanguages = [];
  }

  // Step 3: Try fetching Chinese track content
  if (tracks.length > 0) {
    const zhTrack = findTrack(tracks, CHINESE_LANG_CODES);
    if (zhTrack) {
      const captions = await fetchAndParseCaptions(zhTrack);
      if (captions.length > 0) {
        return { captions, lang: zhTrack.languageCode };
      }
    }

    // Step 4: Try translating an available subtitle track into Chinese
    if (canTranslateToChinese(translationLanguages)) {
      const sourceTrack =
        findTrack(tracks, ENGLISH_LANG_CODES) ||
        tracks.find((t) => t.kind !== "asr") ||
        tracks[0];
      if (sourceTrack) {
        const translatedTrack = buildTranslatedTrack(sourceTrack, "zh-Hans");
        const translatedCaptions = await fetchAndParseCaptions(translatedTrack);
        if (translatedCaptions.length > 0) {
          return {
            captions: translatedCaptions,
            lang: translatedTrack.languageCode,
          };
        }
      }
    }
  }

  // Step 5: youtube-caption-extractor fallback
  const extractorFallback = await extractViaCaptionExtractor(
    videoId,
    CHINESE_LANG_CODES
  );
  if (extractorFallback) {
    return extractorFallback;
  }

  return null;
}

/**
 * Extract English captions from a YouTube video.
 * Returns null when no English captions are available (does not throw).
 */
export async function extractEnglishCaptions(
  videoId: string
): Promise<NormalizedCaption[] | null> {
  try {
    // Try Supadata first
    const supadataResult = await fetchViaSupadata(videoId, ENGLISH_LANG_CODES);
    if (supadataResult) {
      return supadataResult.captions;
    }

    let tracks: CaptionTrack[] = [];
    try {
      const trackData = await fetchCaptionTrackDataViaPageScrape(videoId);
      tracks = trackData.tracks;
    } catch {
      tracks = [];
    }

    if (tracks.length > 0) {
      const enTrack = findTrack(tracks, ENGLISH_LANG_CODES);
      if (enTrack) {
        const captions = await fetchAndParseCaptions(enTrack);
        if (captions.length > 0) return captions;
      }
    }

    const extractorFallback = await extractViaCaptionExtractor(
      videoId,
      ENGLISH_LANG_CODES
    );
    return extractorFallback?.captions ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse an SRT or VTT caption file buffer into normalized captions.
 * Handles encoding detection for Chinese subtitle files (GB2312, GBK, Big5, etc.)
 */
export function parseCaptionFile(
  buffer: Buffer,
  fileName: string
): NormalizedCaption[] {
  // Step 1: Try decoding as UTF-8 first
  let text = new TextDecoder("utf-8").decode(buffer);

  // Step 2: If no CJK characters found, try encoding detection
  if (!CJK_REGEX.test(text)) {
    const detection = detect(buffer);

    if (detection.encoding && detection.confidence >= 0.5) {
      const mappedEncoding =
        ENCODING_MAP[detection.encoding] ?? detection.encoding.toLowerCase();

      if (mappedEncoding !== "utf-8") {
        try {
          text = new TextDecoder(mappedEncoding).decode(buffer);
        } catch {
          console.warn(
            `[captions] Encoding ${mappedEncoding} not supported for ${fileName}, falling back to UTF-8`
          );
        }
      }
    }
  }

  // Step 3: Parse the decoded text
  const { entries } = parse(text);

  // Step 4: Map to NormalizedCaption, strip HTML tags, filter empty entries
  const captions: NormalizedCaption[] = entries
    .map((entry, idx) => ({
      text: entry.text.replace(/<[^>]*>/g, "").trim(),
      startMs: entry.from,
      endMs: entry.to,
      sequence: idx + 1,
    }))
    .filter((caption) => caption.text.length > 0);

  return captions;
}

/**
 * Detect whether YouTube is blocking server-side caption/media access.
 *
 * Checks by scraping the page for caption tracks and probing the timedtext
 * URLs for empty responses. Returns true when tracks exist but content
 * cannot be fetched (YouTube's PO Token / server-side block).
 */
export async function isYouTubeCaptionAccessBlocked(
  videoId: string
): Promise<boolean> {
  try {
    const { tracks } = await fetchCaptionTrackDataViaPageScrape(videoId);

    if (!Array.isArray(tracks) || tracks.length === 0) {
      // No tracks at all — not necessarily blocked, just no captions
      return false;
    }

    // Probe first couple tracks — if every probe returns empty content,
    // YouTube is blocking server-side timedtext access.
    const toProbe = tracks.slice(0, 2);
    for (const track of toProbe) {
      if (!track?.baseUrl) continue;
      const response = await fetch(track.baseUrl, {
        headers: { "User-Agent": BROWSER_UA },
      });
      const body = await response.text();
      if (body.trim().length > 0) {
        return false; // At least one track returned content → not blocked
      }
    }

    // Tracks exist but all returned empty → blocked
    return true;
  } catch {
    return false;
  }
}
