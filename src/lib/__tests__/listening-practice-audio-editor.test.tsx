// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonEditorClient } from "@/app/(dashboard)/admin/course-library/[courseId]/lessons/[lessonId]/LessonEditorClient";
import { ListeningPracticeViewer } from "@/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/ListeningPracticeViewer";

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

function renderEditor(
  sentenceAudioUrl: string | null = null,
  lessonAudioUrl: string | null = null,
) {
  return render(
    <LessonEditorClient
      initialLesson={{
        id: "lesson-1",
        title: "Listening lesson",
        lessonType: "listening_practice",
        content: {
          audioUrl: lessonAudioUrl,
          sentences: [{ ...sentence, audioUrl: sentenceAudioUrl }],
        },
      }}
    />,
  );
}

describe("listening-practice sentence audio editor", () => {
  it("offers a separate full-lesson upload without replacing sentence audio", () => {
    renderEditor();

    expect(screen.getByText("Full lesson audio")).toBeTruthy();
    expect(screen.getByText("No full recording")).toBeTruthy();
    expect(screen.getByLabelText("Upload full lesson audio")).toBeTruthy();
    expect(
      screen.getByLabelText("Upload audio file for sentence 1"),
    ).toBeTruthy();
  });

  it("shows full-lesson replace, preview, and remove controls when uploaded", () => {
    renderEditor(null, "https://example.com/full-dialogue.mp3");

    expect(screen.getByText("Full recording uploaded")).toBeTruthy();
    expect(screen.getByLabelText("Replace full lesson audio")).toBeTruthy();
    expect(screen.getByLabelText("Full lesson audio preview")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Remove full lesson audio" }),
    ).toBeTruthy();
  });

  it("attaches a successfully uploaded full recording to the lesson", async () => {
    mocks.upload.mockResolvedValue({
      url: "https://example.com/full-dialogue.mp3",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    renderEditor();

    const input = screen.getByLabelText(
      "Upload full lesson audio",
    ) as HTMLInputElement;
    const largeFile = new File(
      [new Uint8Array(4 * 1024 * 1024 + 1)],
      "full-dialogue.mp3",
      { type: "audio/mpeg" },
    );
    fireEvent.change(input, { target: { files: [largeFile] } });

    expect(await screen.findByText("Full recording uploaded")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/course-library/lessons/lesson-1",
      expect.objectContaining({
        method: "PUT",
        body: expect.stringContaining(
          "https://example.com/full-dialogue.mp3",
        ),
      }),
    );
  });

  it("removes only the full recording and preserves sentence content", async () => {
    const mockedFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockedFetch);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    renderEditor(null, "https://example.com/full-dialogue.mp3");

    fireEvent.click(
      screen.getByRole("button", { name: "Remove full lesson audio" }),
    );

    expect(await screen.findByText("No full recording")).toBeTruthy();
    const request = mockedFetch.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      content: Record<string, unknown>;
    };
    expect(body.content.audioUrl).toBeUndefined();
    expect(body.content.sentences).toEqual([
      expect.objectContaining({ id: "sentence-1", chinese: "你好" }),
    ]);
  });

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

describe("listening-practice student audio", () => {
  it("shows the complete recording before the sentence drills when present", () => {
    render(
      <ListeningPracticeViewer
        lessonId="lesson-1"
        sentences={[]}
        hasLessonAudio
      />,
    );

    const player = screen.getByLabelText("Full lesson audio");
    expect(player.getAttribute("src")).toBe(
      "/api/course-library/audio/lesson-1",
    );
  });
});
