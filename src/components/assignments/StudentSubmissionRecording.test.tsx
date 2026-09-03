// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentSubmissionRecording } from "@/components/assignments/StudentSubmissionRecording";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function rect({
  top,
  left = 40,
  width = 600,
  height = 100,
}: {
  top: number;
  left?: number;
  width?: number;
  height?: number;
}): DOMRect {
  return {
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  };
}

describe("student submission recording", () => {
  it("pins diary audio while the reviewer scrolls", () => {
    let anchorTop = 300;
    const animationFrames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.dataset.testid === "student-submission-recording-anchor") {
          return rect({ top: anchorTop });
        }
        if (this.dataset.testid === "student-submission-recording") {
          return rect({ top: anchorTop });
        }
        return rect({ top: 0, left: 0, width: 0, height: 0 });
      },
    );

    render(<StudentSubmissionRecording src="/diary.mp3" sticky />);
    act(() => animationFrames.splice(0).forEach((callback) => callback(0)));

    const recording = screen.getByTestId("student-submission-recording");
    const audio = recording.querySelector("audio");

    expect(recording.getAttribute("data-sticky")).toBe("true");
    expect(recording.getAttribute("data-pinned")).toBe("false");
    expect(recording.textContent).toContain("Stays visible while you review");
    expect(audio?.getAttribute("src")).toBe("/diary.mp3");

    anchorTop = 0;
    fireEvent.scroll(window);
    act(() => animationFrames.splice(0).forEach((callback) => callback(0)));

    expect(recording.getAttribute("data-pinned")).toBe("true");
    expect(recording.className).toContain("fixed");
    expect(recording.style.left).toBe("40px");
    expect(recording.style.width).toBe("600px");
    // The same media node is repositioned, so active playback is not reset.
    expect(recording.querySelector("audio")).toBe(audio);
  });

  it("keeps non-diary recordings in the normal document flow", () => {
    render(<StudentSubmissionRecording src="/assignment.mp3" />);

    const recording = screen.getByTestId("student-submission-recording");

    expect(recording.getAttribute("data-sticky")).toBe("false");
    expect(recording.getAttribute("data-pinned")).toBe("false");
    expect(recording.className.split(/\s+/)).not.toContain("fixed");
    expect(recording.textContent).not.toContain(
      "Stays visible while you review",
    );
  });
});
