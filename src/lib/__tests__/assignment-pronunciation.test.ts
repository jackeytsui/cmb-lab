import { describe, expect, it } from "vitest";
import { isValidPronunciationMarkRange } from "@/lib/assignment-pronunciation";

describe("pronunciation marker ranges", () => {
  const text = "今天很暖。";

  it("accepts an exact submitted-text range", () => {
    expect(
      isValidPronunciationMarkRange(
        { startOffset: 3, endOffset: 4, originalText: "暖" },
        text,
      ),
    ).toBe(true);
  });

  it("rejects stale text and invalid offsets", () => {
    expect(
      isValidPronunciationMarkRange(
        { startOffset: 3, endOffset: 4, originalText: "冷" },
        text,
      ),
    ).toBe(false);
    expect(
      isValidPronunciationMarkRange(
        { startOffset: 4, endOffset: 4, originalText: "" },
        text,
      ),
    ).toBe(false);
  });
});
