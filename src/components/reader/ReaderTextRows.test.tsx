// @vitest-environment happy-dom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReaderTextRows } from "./ReaderTextRows";

const segments = [
  { text: "比较", index: 0, isWordLike: true },
  { text: "暖", index: 2, isWordLike: true },
];

describe("ReaderTextRows", () => {
  it("keeps Pinyin, Jyutping, and Chinese in independently selectable rows", () => {
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

    const pinyinRow = container.querySelector(
      '[data-aligned-romanization-row="pinyin"]',
    );
    const jyutpingRow = container.querySelector(
      '[data-aligned-romanization-row="jyutping"]',
    );
    const chineseRow = container.querySelector("[data-aligned-chinese-row]");

    expect(pinyinRow?.textContent).toBe("bǐ jiào nuǎn");
    expect(jyutpingRow?.textContent).toBe("bei2 gaau3 nyun5");
    expect(chineseRow?.textContent).toBe("比较暖");
    expect(pinyinRow?.parentElement).toBe(chineseRow?.parentElement);
    expect(jyutpingRow?.parentElement).toBe(chineseRow?.parentElement);
    expect(pinyinRow?.contains(chineseRow)).toBe(false);
    expect(chineseRow?.contains(pinyinRow)).toBe(false);
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
