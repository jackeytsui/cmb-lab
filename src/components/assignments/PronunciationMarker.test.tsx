// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CorrectedSentence } from "./CorrectedSentence";
import { PronunciationMarkerEditor } from "./PronunciationMarker";

describe("PronunciationMarkerEditor", () => {
  it("creates a marker from the matching pinyin or Chinese cell", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PronunciationMarkerEditor
        chinese="今天很暖。"
        romanization="jīn tiān hěn nuǎn"
        marks={[]}
        lang="mandarin"
        onChange={onChange}
      />,
    );

    const warmCells = container.querySelectorAll(
      '[data-pronunciation-offset="3"]',
    );
    const wrappedContent = container.querySelector(
      "[data-pronunciation-wrapped-content]",
    );
    expect(wrappedContent?.className).toContain("flex-wrap");
    expect(wrappedContent?.className).not.toContain("overflow-x-auto");
    expect(warmCells).toHaveLength(2);
    fireEvent.click(warmCells[0]);

    expect(screen.getByDisplayValue("nuǎn")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Save pronunciation marker" }),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0][0]).toMatchObject({
      startOffset: 3,
      endOffset: 4,
      originalText: "暖",
      expectedPronunciation: "nuǎn",
      issueType: "tone",
      audioTimestampSeconds: null,
    });
  });

  it("captures the current student-recording timestamp", () => {
    const onChange = vi.fn();
    const audio = document.createElement("audio");
    audio.id = "review-recording";
    audio.currentTime = 6.4;
    document.body.append(audio);

    const { container } = render(
      <PronunciationMarkerEditor
        chinese="暖"
        romanization="nuǎn"
        marks={[]}
        lang="mandarin"
        mediaElementId="review-recording"
        onChange={onChange}
      />,
    );

    fireEvent.click(
      container.querySelector('[data-pronunciation-offset="0"]')!,
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Attach current recording time",
      }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Save pronunciation marker" }),
    );

    expect(onChange.mock.calls[0][0][0].audioTimestampSeconds).toBe(6);
    audio.remove();
  });

  it("opens the editor from a contextual Diary selection without duplicating the sentence", () => {
    const { container } = render(
      <PronunciationMarkerEditor
        chinese="今天很暖"
        romanization="jīn tiān hěn nuǎn"
        marks={[]}
        lang="mandarin"
        showSentence={false}
        initialSelection={{ startOffset: 2, endOffset: 4 }}
        onChange={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-pronunciation-wrapped-content]"),
    ).toBeNull();
    expect(screen.getByDisplayValue("hěn nuǎn")).toBeTruthy();
    expect(screen.getByText(/很暖/)).toBeTruthy();
  });

  it("ignores a drag selection that crosses a wrapped line", () => {
    const onChange = vi.fn();
    const { container } = render(
      <PronunciationMarkerEditor
        chinese="今天很暖"
        romanization="jīn tiān hěn nuǎn"
        marks={[]}
        lang="mandarin"
        onChange={onChange}
      />,
    );
    const cells = container.querySelectorAll(
      '[data-pronunciation-kind="chinese"]',
    );
    const units = container.querySelectorAll<HTMLElement>(
      "[data-pronunciation-unit]",
    );
    Object.defineProperty(units[0], "offsetTop", { value: 0 });
    Object.defineProperty(units[3], "offsetTop", { value: 40 });

    const range = document.createRange();
    range.setStart(cells[0]?.firstChild as Text, 0);
    range.setEnd(cells[3]?.firstChild as Text, 1);
    const removeAllRanges = vi.fn();
    vi.spyOn(window, "getSelection").mockReturnValue({
      isCollapsed: false,
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges,
    } as unknown as Selection);

    fireEvent.mouseUp(
      container.querySelector("[data-pronunciation-wrapped-content]")!
        .parentElement!,
    );

    expect(removeAllRanges).toHaveBeenCalledTimes(1);
    expect(screen.queryByDisplayValue("jīn tiān hěn nuǎn")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Diary contextual pronunciation selection", () => {
  it("opens pronunciation directly when the reviewer clicks romanization", () => {
    const onSelectPronunciationRange = vi.fn();
    const { container } = render(
      <CorrectedSentence
        text="比較暖"
        pinyin="bei2 gaau3 nyun5"
        lang="cantonese"
        corrections={[]}
        pronunciationMarks={[]}
        onSelectPronunciationRange={onSelectPronunciationRange}
      />,
    );

    fireEvent.click(
      container.querySelectorAll(
        '[data-pronunciation-kind="romanization"]',
      )[1]!,
    );

    expect(onSelectPronunciationRange).toHaveBeenCalledWith(1, 2);
  });
});
