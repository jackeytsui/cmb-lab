// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonEditorClient } from "@/app/(dashboard)/admin/course-library/[courseId]/lessons/[lessonId]/LessonEditorClient";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), refresh: vi.fn() }));

vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/ui/rich-text-editor", () => ({
  RichTextEditor: () => null,
}));

const sentence = {
  id: "sentence-1",
  order: 0,
  chinese: "你好",
  pinyin: "nǐ hǎo",
  english: "Hello",
  audioUrl: null,
};

beforeEach(() => {
  // This repo's Vitest transform uses the classic JSX runtime.
  vi.stubGlobal("React", React);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function renderEditor(audioUrl: string | null = null) {
  return render(
    <LessonEditorClient
      initialLesson={{
        id: "lesson-1",
        title: "Listening lesson",
        lessonType: "listening_practice",
        content: { sentences: [{ ...sentence, audioUrl }] },
      }}
    />,
  );
}

describe("listening-practice sentence audio editor", () => {
  it("makes the generated-audio replacement control explicit", () => {
    renderEditor();

    expect(screen.getByText("How sentence audio works")).toBeTruthy();
    expect(screen.getByText("Generated voice")).toBeTruthy();
    expect(
      screen.getByLabelText("Upload audio file for sentence 1"),
    ).toBeTruthy();
    expect(screen.getByText("Upload audio file")).toBeTruthy();
  });

  it("shows clear replace and remove controls for custom audio", () => {
    renderEditor("https://example.com/custom.mp3");

    expect(screen.getByText("Custom audio")).toBeTruthy();
    expect(
      screen.getByLabelText("Replace audio file for sentence 1"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove custom audio" }),
    ).toBeTruthy();
  });

  it("shows upload failures instead of swallowing them", async () => {
    mocks.upload.mockRejectedValue(new Error("Storage unavailable"));
    renderEditor();

    const input = screen.getByLabelText(
      "Upload audio file for sentence 1",
    ) as HTMLInputElement;
    const largeFile = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "sentence.mp3",
      { type: "audio/mpeg" },
    );
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Upload failed: Storage unavailable",
    );
  });
});
