import { describe, expect, it } from "vitest";
import {
  parsePodcastLessonPath,
  podcastAudioFileExtension,
} from "@/lib/podcast-feed";

const LESSON_ID = "b13756d5-2e0f-4076-9f36-3a93d988c4eb";

describe("private podcast feed paths", () => {
  it("accepts both new Apple-compatible and legacy lesson URLs", () => {
    expect(parsePodcastLessonPath(`${LESSON_ID}.mp3`)).toBe(LESSON_ID);
    expect(parsePodcastLessonPath(LESSON_ID)).toBe(LESSON_ID);
  });

  it("rejects malformed lesson paths before querying Postgres", () => {
    expect(parsePodcastLessonPath("../../not-a-lesson.mp3")).toBeNull();
    expect(parsePodcastLessonPath(`${LESSON_ID}.mp3.exe`)).toBeNull();
  });

  it("uses a file extension that matches Apple-supported audio types", () => {
    expect(podcastAudioFileExtension("audio/mpeg")).toBe("mp3");
    expect(podcastAudioFileExtension("audio/x-m4a; charset=binary")).toBe(
      "m4a",
    );
  });
});
