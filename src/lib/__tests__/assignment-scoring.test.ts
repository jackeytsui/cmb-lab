import { describe, expect, it } from "vitest";
import {
  calculateTextAssignmentScore,
  countChineseCharacters,
  countCorrectedChineseCharacters,
  hasOverlappingRanges,
  isChineseCharacter,
  isValidCorrectionRange,
} from "../assignment-scoring";

describe("isChineseCharacter", () => {
  it("accepts common CJK ideographs", () => {
    expect(isChineseCharacter("我")).toBe(true);
    expect(isChineseCharacter("學")).toBe(true); // traditional
    expect(isChineseCharacter("学")).toBe(true); // simplified
  });

  it("rejects punctuation, latin, digits, and spaces", () => {
    expect(isChineseCharacter("，")).toBe(false);
    expect(isChineseCharacter("。")).toBe(false);
    expect(isChineseCharacter("a")).toBe(false);
    expect(isChineseCharacter("3")).toBe(false);
    expect(isChineseCharacter(" ")).toBe(false);
    expect(isChineseCharacter("ǎ")).toBe(false); // pinyin tone mark
  });
});

describe("countChineseCharacters", () => {
  it("counts only ideographs", () => {
    expect(countChineseCharacters("我昨天去公园。")).toBe(6);
    expect(countChineseCharacters("我 hello 你, 好!")).toBe(3);
    expect(countChineseCharacters("wǒ zuótiān")).toBe(0);
    expect(countChineseCharacters("")).toBe(0);
  });
});

describe("isValidCorrectionRange", () => {
  it("accepts in-bounds non-empty ranges", () => {
    expect(isValidCorrectionRange({ startOffset: 0, endOffset: 2 }, 5)).toBe(true);
    expect(isValidCorrectionRange({ startOffset: 4, endOffset: 5 }, 5)).toBe(true);
  });

  it("rejects empty, reversed, negative, or out-of-bounds ranges", () => {
    expect(isValidCorrectionRange({ startOffset: 2, endOffset: 2 }, 5)).toBe(false);
    expect(isValidCorrectionRange({ startOffset: 3, endOffset: 2 }, 5)).toBe(false);
    expect(isValidCorrectionRange({ startOffset: -1, endOffset: 2 }, 5)).toBe(false);
    expect(isValidCorrectionRange({ startOffset: 0, endOffset: 6 }, 5)).toBe(false);
    expect(isValidCorrectionRange({ startOffset: 0.5, endOffset: 2 }, 5)).toBe(false);
  });
});

describe("hasOverlappingRanges", () => {
  it("detects overlaps and allows touching ranges", () => {
    expect(
      hasOverlappingRanges([
        { startOffset: 0, endOffset: 3 },
        { startOffset: 2, endOffset: 5 },
      ]),
    ).toBe(true);
    expect(
      hasOverlappingRanges([
        { startOffset: 0, endOffset: 3 },
        { startOffset: 3, endOffset: 5 },
      ]),
    ).toBe(false);
    expect(hasOverlappingRanges([])).toBe(false);
  });
});

describe("countCorrectedChineseCharacters", () => {
  const sentence = "我昨天去学校，然后喝咖啡。"; // 11 Chinese chars + 2 punctuation

  it("counts Chinese characters inside ranges only", () => {
    // "学校" at offsets 4-6
    expect(
      countCorrectedChineseCharacters(sentence, [
        { startOffset: 4, endOffset: 6 },
      ]),
    ).toBe(2);
  });

  it("ignores punctuation inside a corrected range", () => {
    // "学校，然" covers the comma too
    expect(
      countCorrectedChineseCharacters(sentence, [
        { startOffset: 4, endOffset: 8 },
      ]),
    ).toBe(3);
  });

  it("merges overlapping ranges without double counting", () => {
    expect(
      countCorrectedChineseCharacters(sentence, [
        { startOffset: 0, endOffset: 4 },
        { startOffset: 2, endOffset: 6 },
      ]),
    ).toBe(6);
  });

  it("clamps out-of-bounds ranges", () => {
    expect(
      countCorrectedChineseCharacters(sentence, [
        { startOffset: 9, endOffset: 99 },
      ]),
    ).toBe(3); // 喝咖啡 (final 。 not counted)
  });
});

describe("calculateTextAssignmentScore", () => {
  it("matches the spec example: 3 corrected of 20 → 85%", () => {
    // 20 Chinese chars across two sentences, 3 corrected
    const score = calculateTextAssignmentScore([
      {
        chineseText: "我昨天去学校学习中文。", // 10 chars
        corrections: [{ startOffset: 4, endOffset: 6 }], // 学校 → 2 chars
      },
      {
        chineseText: "然后我和朋友去喝咖啡。", // 10 chars
        corrections: [{ startOffset: 6, endOffset: 7 }], // 喝 → 1 char
      },
    ]);
    expect(score).toBe(85);
  });

  it("returns 100 when there are no corrections", () => {
    expect(
      calculateTextAssignmentScore([
        { chineseText: "我很开心。", corrections: [] },
      ]),
    ).toBe(100);
  });

  it("rounds to the nearest whole number", () => {
    // 1 of 3 corrected → 66.66… → 67
    expect(
      calculateTextAssignmentScore([
        {
          chineseText: "我很好",
          corrections: [{ startOffset: 0, endOffset: 1 }],
        },
      ]),
    ).toBe(67);
  });

  it("does not count punctuation toward the total", () => {
    // "我很好。！" → 3 Chinese chars; correcting the whole string corrects 3/3
    expect(
      calculateTextAssignmentScore([
        {
          chineseText: "我很好。！",
          corrections: [{ startOffset: 0, endOffset: 5 }],
        },
      ]),
    ).toBe(0);
  });

  it("returns null for submissions without Chinese characters", () => {
    expect(
      calculateTextAssignmentScore([{ chineseText: "hello", corrections: [] }]),
    ).toBeNull();
    expect(calculateTextAssignmentScore([])).toBeNull();
  });
});
