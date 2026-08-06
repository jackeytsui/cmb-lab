import { describe, expect, it } from "vitest";
import { smartRomanise } from "@/lib/romanise";

describe("smartRomanise", () => {
  it("returns exactly one Mandarin syllable per Han character", () => {
    expect(smartRomanise("你好，世界2021 A32 [name]。", "mandarin")).toBe(
      "nǐ hǎo shì jiè",
    );
  });

  it("returns Jyutping while skipping punctuation and English names", () => {
    expect(smartRomanise("我叫Janelle。", "cantonese")).toBe("ngo5 giu3");
  });
});
