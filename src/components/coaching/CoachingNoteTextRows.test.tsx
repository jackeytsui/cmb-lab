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
  it("renders independently selectable pinyin and Chinese in wrapping units", () => {
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

    const romanizationCells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );
    const chineseCells = container.querySelectorAll(
      '[data-aligned-language-cell="chinese"]',
    );

    expect(
      Array.from(romanizationCells, (cell) => cell.textContent?.trim())
        .filter(Boolean)
        .join(" "),
    ).toBe("bǐ jiào bǎo nuǎn");
    expect(Array.from(chineseCells, (cell) => cell.textContent).join(""))
      .toBe("比较 保暖");
    expect(romanizationCells).toHaveLength(5);
    expect(chineseCells).toHaveLength(5);
    expect(container.querySelector("[data-aligned-wrapped-content]")).toBeTruthy();
  });

  it("uses the same wrapping layout for Cantonese jyutping", () => {
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
      Array.from(
        container.querySelectorAll('[data-aligned-language-cell="jyutping"]'),
        (cell) => cell.textContent,
      ).join(" "),
    ).toBe("bei2 gaau3");
    expect(
      Array.from(
        container.querySelectorAll('[data-aligned-language-cell="chinese"]'),
        (cell) => cell.textContent,
      ).join(""),
    ).toBe("比較");
  });
});
