// @vitest-environment happy-dom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudentSubmissionRecording } from "@/components/assignments/StudentSubmissionRecording";

afterEach(cleanup);

describe("student submission recording", () => {
  it("pins diary audio while the reviewer scrolls", () => {
    render(<StudentSubmissionRecording src="/diary.mp3" sticky />);

    const recording = screen.getByTestId("student-submission-recording");
    const audio = recording.querySelector("audio");

    expect(recording.getAttribute("data-sticky")).toBe("true");
    expect(recording.className).toContain("sticky");
    expect(recording.textContent).toContain("Stays visible while you review");
    expect(audio?.getAttribute("src")).toBe("/diary.mp3");
  });

  it("keeps non-diary recordings in the normal document flow", () => {
    render(<StudentSubmissionRecording src="/assignment.mp3" />);

    const recording = screen.getByTestId("student-submission-recording");

    expect(recording.getAttribute("data-sticky")).toBe("false");
    expect(recording.className.split(/\s+/)).not.toContain("sticky");
    expect(recording.textContent).not.toContain(
      "Stays visible while you review",
    );
  });
});
