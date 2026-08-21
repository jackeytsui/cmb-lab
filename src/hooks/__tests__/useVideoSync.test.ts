import { describe, expect, it } from "vitest";
import { findActiveCaptionIndex } from "@/hooks/useVideoSync";

const captions = [
  { text: "one", startMs: 1_000, endMs: 2_000, sequence: 1 },
  { text: "two", startMs: 2_250, endMs: 3_000, sequence: 2 },
  { text: "three", startMs: 3_000, endMs: 4_500, sequence: 3 },
];

describe("findActiveCaptionIndex", () => {
  it("uses inclusive starts and exclusive ends", () => {
    expect(findActiveCaptionIndex(captions, 1_000)).toBe(0);
    expect(findActiveCaptionIndex(captions, 1_999)).toBe(0);
    expect(findActiveCaptionIndex(captions, 2_000)).toBe(-1);
    expect(findActiveCaptionIndex(captions, 2_250)).toBe(1);
    expect(findActiveCaptionIndex(captions, 3_000)).toBe(2);
    expect(findActiveCaptionIndex(captions, 4_500)).toBe(-1);
  });

  it("handles empty transcripts and gaps without selecting a stale line", () => {
    expect(findActiveCaptionIndex([], 1_000)).toBe(-1);
    expect(findActiveCaptionIndex(captions, 0)).toBe(-1);
    expect(findActiveCaptionIndex(captions, 2_100)).toBe(-1);
  });

  it("falls back to an earlier still-active caption when tracks overlap", () => {
    const overlapping = [
      { text: "long", startMs: 0, endMs: 10_000, sequence: 1 },
      { text: "short", startMs: 5_000, endMs: 6_000, sequence: 2 },
    ];
    expect(findActiveCaptionIndex(overlapping, 5_500)).toBe(1);
    expect(findActiveCaptionIndex(overlapping, 7_000)).toBe(0);
  });
});
