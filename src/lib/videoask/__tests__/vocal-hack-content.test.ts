import { describe, expect, it } from "vitest";
import {
  sourceResponseMediaTypes,
  sourceResponseTimeLimitSeconds,
  studentFacingSourcePrompt,
} from "../vocal-hack-content";

describe("VideoAsk Vocal Hack content fidelity", () => {
  it("preserves audio and video response modes with audio first", () => {
    expect(
      sourceResponseMediaTypes({
        allowed_answer_media_types: ["video", "audio", "text"],
      }),
    ).toEqual(["audio", "video"]);
    expect(
      sourceResponseMediaTypes({ allowed_answer_media_types: ["video"] }),
    ).toEqual(["video"]);
  });

  it("uses a safe bounded source recording limit", () => {
    expect(sourceResponseTimeLimitSeconds({ reply_media_time_limit: 300 })).toBe(
      300,
    );
    expect(sourceResponseTimeLimitSeconds({ reply_media_time_limit: 2 })).toBe(10);
    expect(sourceResponseTimeLimitSeconds({ reply_media_time_limit: 900 })).toBe(
      600,
    );
  });

  it("keeps meaningful prompts and hides generic VideoAsk labels", () => {
    expect(studentFacingSourcePrompt("Repeat after Jane")).toBe(
      "Repeat after Jane",
    );
    expect(studentFacingSourcePrompt("sentence 2")).toBeNull();
    expect(studentFacingSourcePrompt("Step #4.")).toBeNull();
  });
});
