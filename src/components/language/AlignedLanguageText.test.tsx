// @vitest-environment happy-dom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AlignedLanguageText } from "./AlignedLanguageText";

describe("AlignedLanguageText", () => {
  it("wraps character units while keeping romanization above its character", () => {
    const { container } = render(
      <AlignedLanguageText
        chinese="比较暖"
        pinyin="bǐ jiào nuǎn"
        english="Relatively warm."
      />,
    );

    const content = container.querySelector("[data-aligned-wrapped-content]");
    const units = container.querySelectorAll("[data-aligned-unit]");
    const pinyinCells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );
    const chineseCells = container.querySelectorAll(
      '[data-aligned-language-cell="chinese"]',
    );
    const englishRow = container.querySelector("[data-aligned-english-row]");

    expect(content?.className).toContain("flex-wrap");
    expect(content?.className).not.toContain("overflow-x-auto");
    expect(units).toHaveLength(3);
    expect(Array.from(pinyinCells, (cell) => cell.textContent)).toEqual([
      "bǐ",
      "jiào",
      "nuǎn",
    ]);
    expect(Array.from(chineseCells, (cell) => cell.textContent)).toEqual([
      "比",
      "较",
      "暖",
    ]);
    expect(englishRow?.textContent).toBe("Relatively warm.");
    expect(units[0]?.children[0]).toBe(pinyinCells[0]);
    expect(units[0]?.children[1]).toBe(chineseCells[0]);
  });

  it("aligns romanization only to Han characters without shifting punctuation", () => {
    const { container } = render(
      <AlignedLanguageText chinese="你，好" pinyin="nǐ hǎo" />,
    );
    const cells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );

    expect(cells).toHaveLength(3);
    expect(cells[0]?.textContent).toBe("nǐ");
    expect(cells[1]?.textContent).toBe("\u00a0");
    expect(cells[2]?.textContent).toBe("hǎo");
  });

  it("removes browser-inserted line breaks when Chinese is copied", () => {
    const { container } = render(
      <AlignedLanguageText chinese="比较暖" pinyin="bǐ jiào nuǎn" />,
    );
    const cells = container.querySelectorAll(
      '[data-aligned-language-cell="chinese"]',
    );
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
    const cells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );
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

  it("copies only the active language when the browser range crosses both layers", () => {
    const { container } = render(
      <AlignedLanguageText chinese="比较暖" pinyin="bǐ jiào nuǎn" />,
    );
    const pinyinCells = container.querySelectorAll(
      '[data-aligned-language-cell="pinyin"]',
    );
    const chineseCells = container.querySelectorAll(
      '[data-aligned-language-cell="chinese"]',
    );
    fireEvent.pointerDown(pinyinCells[0]!);

    const range = document.createRange();
    range.setStart(pinyinCells[0]?.firstChild as Text, 0);
    range.setEnd(chineseCells[2]?.firstChild as Text, 1);
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      toString: () => "bǐ比较jiào暖nuǎn",
    } as unknown as Selection);
    const setData = vi.fn();

    fireEvent.copy(container.firstElementChild as Element, {
      clipboardData: { setData },
    });

    expect(setData).toHaveBeenCalledWith("text/plain", "bǐ jiào nuǎn");
  });

  it("keeps the other language out of the active text selection", () => {
    const { container } = render(
      <AlignedLanguageText chinese="比较暖" pinyin="bǐ jiào nuǎn" />,
    );
    const pinyinCell = container.querySelector(
      '[data-aligned-language-cell="pinyin"]',
    )!;
    const chineseCell = container.querySelector(
      '[data-aligned-language-cell="chinese"]',
    )!;

    fireEvent.pointerDown(pinyinCell);
    expect(chineseCell.className).toContain("select-none");
    expect(chineseCell.className).toContain("selection:bg-transparent");
    expect(pinyinCell.className).not.toContain("select-none");

    fireEvent.pointerDown(chineseCell);
    expect(pinyinCell.className).toContain("select-none");
    expect(pinyinCell.className).toContain("selection:bg-transparent");
    expect(chineseCell.className).not.toContain("select-none");
  });
});
