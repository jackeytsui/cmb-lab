// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
});
