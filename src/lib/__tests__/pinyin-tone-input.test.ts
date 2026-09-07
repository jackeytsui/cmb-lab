// @vitest-environment happy-dom

import { describe, expect, it, vi } from "vitest";
import {
  adjustedPinyinToneCursor,
  applyPinyinToneNumbers,
  handlePinyinToneInputChange,
} from "@/lib/pinyin-tone-input";

describe("applyPinyinToneNumbers", () => {
  it("converts all four numbered Mandarin tones", () => {
    expect(applyPinyinToneNumbers("ma1 ma2 ma3 ma4")).toBe("mā má mǎ mà");
  });

  it("uses standard vowel placement and supports ü/v input", () => {
    expect(applyPinyinToneNumbers("ni3 hao3 shui4 dou1 nü3 nv3")).toBe(
      "nǐ hǎo shuì dōu nǚ nǚ",
    );
  });

  it("leaves Jyutping-style tone 5/6 digits and unrelated text unchanged", () => {
    expect(applyPinyinToneNumbers("nei5 hou2 123")).toBe("nei5 hóu 123");
  });

  it("moves the caret back by the collapsed tone digit", () => {
    expect(adjustedPinyinToneCursor("say ni3 now", "say nǐ now", 7)).toBe(6);
  });

  it("updates a controlled Mandarin input and preserves its caret", () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const input = document.createElement("input");
    input.value = "zhi3";
    input.setSelectionRange(4, 4);
    const values: string[] = [];

    handlePinyinToneInputChange(input, (value) => values.push(value));

    expect(values).toEqual(["zhǐ"]);
    expect(input.selectionStart).toBe(3);
  });

  it("leaves numbered Jyutping unchanged when conversion is disabled", () => {
    const input = document.createElement("input");
    input.value = "nei5 hou2";
    const values: string[] = [];

    handlePinyinToneInputChange(input, (value) => values.push(value), false);

    expect(values).toEqual(["nei5 hou2"]);
  });
});
