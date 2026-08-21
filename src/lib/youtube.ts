import { z } from "zod";

/**
 * Extract IDs from the YouTube URL formats accepted by the listening lab:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube-nocookie.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 * - https://www.youtube.com/live/VIDEO_ID
 */
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract a YouTube video ID from a URL string.
 * Returns the 11-character video ID or null if the URL is not a valid YouTube URL.
 */
export function extractVideoId(url: string): string | null {
  const input = url.trim();
  if (!input) return null;

  try {
    const parsed = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`,
    );
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let candidate: string | null = null;

    if (host === "youtu.be") {
      candidate = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    } else if (
      host === "youtube.com" ||
      host.endsWith(".youtube.com") ||
      host === "youtube-nocookie.com" ||
      host.endsWith(".youtube-nocookie.com")
    ) {
      candidate = parsed.searchParams.get("v");
      if (!candidate) {
        const [kind, id] = parsed.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "v", "live"].includes(kind)) candidate = id ?? null;
      }
    }

    return candidate && VIDEO_ID.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

/** Parse YouTube `t` / `start` offsets (seconds or 1h2m3s notation). */
export function extractYouTubeStartSeconds(url: string): number {
  const input = url.trim();
  if (!input) return 0;
  try {
    const parsed = new URL(
      /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`,
    );
    const value =
      parsed.searchParams.get("start") ??
      parsed.searchParams.get("t") ??
      new URLSearchParams(parsed.hash.replace(/^#/, "")).get("t");
    if (!value) return 0;
    if (/^\d+$/.test(value)) {
      const seconds = Number(value);
      return Number.isSafeInteger(seconds) ? seconds : 0;
    }
    const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
    if (!match) return 0;
    const seconds =
      Number(match[1] ?? 0) * 3600 +
      Number(match[2] ?? 0) * 60 +
      Number(match[3] ?? 0);
    return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : 0;
  } catch {
    return 0;
  }
}

/**
 * Zod schema that validates a string is a valid YouTube URL.
 * Refines by attempting to extract a video ID.
 */
export const youtubeUrlSchema = z
  .string()
  .min(1, "Please enter a YouTube URL")
  .refine((url) => extractVideoId(url) !== null, {
    message:
      "Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...)",
  });
