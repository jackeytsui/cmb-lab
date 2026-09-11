// @vitest-environment happy-dom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlignedLanguageText } from "./AlignedLanguageText";

describe("AlignedLanguageText", () => {
  it("uses separate rows whose cells share matching grid columns", () => {
    const { container } = render(
      <AlignedLanguageText
        chinese="比较暖"
        pinyin="bǐ jiào nuǎn"
        english="Relatively warm."
      />,
    );

    const pinyinRow = container.querySelector(
      '[data-aligned-romanization-row="pinyin"]',
    );
    const chineseRow = container.querySelector("[data-aligned-chinese-row]");
    const englishRow = container.querySelector("[data-aligned-english-row]");
    const grid = chineseRow?.parentElement;

    expect(pinyinRow?.textContent).toBe("bǐ jiào nuǎn");
    expect(chineseRow?.textContent).toBe("比较暖");
    expect(englishRow?.textContent).toBe("Relatively warm.");
    expect(pinyinRow?.parentElement).toBe(grid);
    expect(chineseRow?.parentElement).toBe(grid);
    expect(grid?.getAttribute("style")).toContain("repeat(3, max-content)");
    expect(pinyinRow?.children).toHaveLength(3);
    expect(chineseRow?.children).toHaveLength(3);
  });

  it("aligns romanization only to Han characters without shifting punctuation", () => {
    const { container } = render(
      <AlignedLanguageText chinese="你，好" pinyin="nǐ hǎo" />,
    );
    const cells = container.querySelectorAll(
      '[data-aligned-romanization-row="pinyin"] > span',
    );

    expect(cells).toHaveLength(3);
    expect(cells[0]?.textContent).toBe("nǐ ");
    expect(cells[1]?.textContent).toBe("");
    expect(cells[2]?.textContent).toBe("hǎo");
  });

  it("removes browser-inserted line breaks when Chinese is copied", () => {
    const { container } = render(
      <AlignedLanguageText chinese="比较暖" pinyin="bǐ jiào nuǎn" />,
    );
    const chineseRow = container.querySelector("[data-aligned-chinese-row]");
    const cells = chineseRow?.querySelectorAll("span");
    const range = document.createRange();
    range.setStart(cells?.[0]?.firstChild as Text, 0);
    range.setEnd(cells?.[2]?.firstChild as Text, 1);
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "比\n较\n暖",
    } as unknown as Selection;
    vi.spyOn(window, "getSelection").mockReturnValue(selection);
    const setData = vi.fn();

    fireEvent.copy(container.firstElementChild as Element, {
      clipboardData: { setData },
    });

    expect(setData).toHaveBeenCalledWith("text/plain", "比较暖");
  });

  it("turns browser-inserted Pinyin line breaks into spaces when copied", () => {
    const { container } = render(
      <AlignedLanguageText chinese="比较暖" pinyin="bǐ jiào nuǎn" />,
    );
    const pinyinRow = container.querySelector(
      '[data-aligned-romanization-row="pinyin"]',
    );
    const cells = pinyinRow?.querySelectorAll("span[data-annotation]");
    const range = document.createRange();
    range.setStart(cells?.[0]?.firstChild as Text, 0);
    range.setEnd(cells?.[2]?.firstChild as Text, 4);
    const selection = {
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "bǐ\njiào\nnuǎn",
    } as unknown as Selection;
    vi.spyOn(window, "getSelection").mockReturnValue(selection);
    const setData = vi.fn();

    fireEvent.copy(container.firstElementChild as Element, {
      clipboardData: { setData },
    });

    expect(setData).toHaveBeenCalledWith("text/plain", "bǐ jiào nuǎn");
  });
});
