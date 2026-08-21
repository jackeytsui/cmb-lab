import { describe, expect, it } from "vitest";
import { extractVideoId, extractYouTubeStartSeconds, youtubeUrlSchema } from "@/lib/youtube";

const id = "CcHWoRtK0fw";

describe("extractVideoId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${id}&t=20s`,
    `https://youtu.be/${id}?si=share-token`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `m.youtube.com/watch?v=${id}`,
  ])("accepts a supported YouTube URL: %s", (url) => {
    expect(extractVideoId(url)).toBe(id);
  });

  it.each([
    "",
    "not a URL",
    `https://notyoutube.com/watch?v=${id}`,
    `https://youtube.com.evil.example/watch?v=${id}`,
    "https://www.youtube.com/watch?v=too-short",
    "javascript:alert(1)",
  ])("rejects invalid or lookalike URLs: %s", (url) => {
    expect(extractVideoId(url)).toBeNull();
    expect(youtubeUrlSchema.safeParse(url).success).toBe(false);
  });
});

describe("extractYouTubeStartSeconds", () => {
  it.each([
    ["https://youtu.be/CcHWoRtK0fw?t=1215s", 1215],
    ["https://youtube.com/watch?v=CcHWoRtK0fw&start=90", 90],
    ["https://youtube.com/watch?v=CcHWoRtK0fw&t=1h2m3s", 3723],
    ["youtube.com/watch?v=CcHWoRtK0fw#t=45s", 45],
  ])("parses timestamp %s", (url, expected) => {
    expect(extractYouTubeStartSeconds(url)).toBe(expected);
  });

  it.each([
    "https://youtube.com/watch?v=CcHWoRtK0fw",
    "https://youtube.com/watch?v=CcHWoRtK0fw&t=invalid",
    "not a url",
  ])("returns zero for a missing or invalid timestamp: %s", (url) => {
    expect(extractYouTubeStartSeconds(url)).toBe(0);
  });
});
