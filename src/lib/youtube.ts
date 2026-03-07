import { z } from "zod";

/**
 * Regex to extract YouTube video IDs from all common URL formats:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube-nocookie.com/embed/VIDEO_ID
 * - https://www.youtube.com/v/VIDEO_ID
 */
const YT_REGEX =
  /(?:youtube(?:-nocookie)?\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/**
 * Extract a YouTube video ID from a URL string.
 * Returns the 11-character video ID or null if the URL is not a valid YouTube URL.
 */
export function extractVideoId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match?.[1] ?? null;
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
