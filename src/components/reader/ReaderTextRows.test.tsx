// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReaderTextRows } from "./ReaderTextRows";

const segments = [
  { text: "比较", index: 0, isWordLike: true },
  { text: "暖", index: 2, isWordLike: true },
];

describe("ReaderTextRows", () => {
  it("keeps Pinyin, Jyutping, and Chinese independently selectable while wrapping", () => {
    const { container } = render(
      <ReaderTextRows
        segments={segments}
        text="比较暖"
        pinyin="bǐ jiào nuǎn"
        jyutping="bei2 gaau3 nyun5"
        showPinyin
        showJyutping
        fontSize={18}
        toneColorsEnabled={false}
        toneLanguage="mandarin"
      />,
    );

    const pinyinCells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );
    const jyutpingCells = container.querySelectorAll(
      '[data-aligned-language-cell="jyutping"]',
    );
    const chineseCells = container.querySelectorAll(
      '[data-aligned-language-cell="chinese"]',
    );

    expect(Array.from(pinyinCells, (cell) => cell.textContent).join(" ")).toBe(
      "bǐ jiào nuǎn",
    );
    expect(Array.from(jyutpingCells, (cell) => cell.textContent).join(" ")).toBe(
      "bei2 gaau3 nyun5",
    );
    expect(Array.from(chineseCells, (cell) => cell.textContent).join("")).toBe(
      "比较暖",
    );
    expect(container.querySelector("[data-aligned-wrapped-content]")).toBeTruthy();
  });

  it("places direct English glosses in their own row", () => {
    const { container } = render(
      <ReaderTextRows
        segments={segments}
        text="比较暖"
        pinyin="bǐ jiào nuǎn"
        showPinyin
        showJyutping={false}
        fontSize={18}
        toneColorsEnabled={false}
        toneLanguage="mandarin"
        englishGlosses={["relatively", "warm"]}
      />,
    );

    expect(
      container.querySelector("[data-aligned-english-row]")?.textContent,
    ).toBe("relatively warm");
  });
});
