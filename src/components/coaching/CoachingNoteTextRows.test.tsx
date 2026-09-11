// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoachingNoteTextRows } from "./CoachingNoteTextRows";

const segments = [
  { text: "比较", index: 0, isWordLike: true },
  { text: " ", index: 2, isWordLike: false },
  { text: "保暖", index: 3, isWordLike: true },
];

describe("CoachingNoteTextRows", () => {
  it("renders pinyin and Chinese as independently selectable sibling rows", () => {
    const { container } = render(
      <CoachingNoteTextRows
        segments={segments}
        text="比较 保暖"
        romanization="bǐ jiào bǎo nuǎn"
        language="mandarin"
        showRomanization
        fontSize={18}
        toneColorsEnabled={false}
      />,
    );

    const romanizationRow = container.querySelector(
      '[data-aligned-romanization-row="pinyin"]',
    );
    const chineseRow = container.querySelector("[data-aligned-chinese-row]");

    expect(romanizationRow?.textContent).toBe("bǐ jiào bǎo nuǎn");
    expect(chineseRow?.textContent).toBe("比较 保暖");
    expect(romanizationRow?.contains(chineseRow)).toBe(false);
    expect(chineseRow?.contains(romanizationRow)).toBe(false);
    expect(romanizationRow?.querySelectorAll('[data-annotation="pinyin"]'))
      .toHaveLength(5);
  });

  it("uses the same separate-row layout for Cantonese jyutping", () => {
    const { container } = render(
      <CoachingNoteTextRows
        segments={[{ text: "比較", index: 0, isWordLike: true }]}
        text="比較"
        romanization="bei2 gaau3"
        language="cantonese"
        showRomanization
        fontSize={18}
        toneColorsEnabled
      />,
    );

    expect(
      container.querySelector('[aria-label="Jyutping"]')?.textContent,
    ).toBe("bei2 gaau3");
    expect(
      container.querySelector('[aria-label="Chinese characters"]')?.textContent,
    ).toBe("比較");
  });
});
