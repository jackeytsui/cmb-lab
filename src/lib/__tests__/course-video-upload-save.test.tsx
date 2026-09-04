// @vitest-environment happy-dom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LessonEditorClient } from "@/app/(dashboard)/admin/course-library/[courseId]/lessons/[lessonId]/LessonEditorClient";

const mocks = vi.hoisted(() => ({ upload: vi.fn(), refresh: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ upload: mocks.upload }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/ui/rich-text-editor", () => ({ RichTextEditor: () => null }));

const id = "lesson-1";
const oldUrl = "https://test.private.blob.vercel-storage.com/course-library/video/old.mp4";
const newUrl = "https://test.private.blob.vercel-storage.com/course-library/video/new.mp4";
const content = {
  videoUrl: oldUrl,
  thumbnailUrl: "https://example.com/thumbnail.jpg",
  description: "Existing description",
  transcript: "Existing transcript",
  attachments: [],
};
const fetchMock = vi.fn();

beforeEach(() => {
  // This repo's Vitest transform uses the classic JSX runtime.
  vi.stubGlobal("React", React);
  vi.stubGlobal("fetch", fetchMock);
  mocks.upload.mockResolvedValue({ url: newUrl });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function renderAndUpload() {
  const { container } = render(<LessonEditorClient initialLesson={{ id, title: "Existing lesson", lessonType: "video", content }} />);
  const input = container.querySelector<HTMLInputElement>('input[type="file"][accept^="video/mp4"]')!;
  // Exercise the real large-file upload handler with a mocked storage SDK.
  const file = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "new.mp4", { type: "video/mp4" });
  fireEvent.change(input, { target: { files: [file] } });
  return { container, input };
}

describe("course video replacement save confirmation", () => {
  it("keeps the old preview and shows an actionable error when saving fails", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }));
    const { container, input } = renderAndUpload();
    await screen.findByText(/saving this lesson could not be confirmed/i);
    expect(container.querySelector("video")?.getAttribute("src")).toContain(encodeURIComponent(oldUrl));
    expect(input.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not show an unconfirmed URL when the response contains a different stored video", async () => {
    fetchMock.mockResolvedValue(Response.json({ lesson: { id, content } }));
    const { container } = renderAndUpload();
    await screen.findByText(/saving this lesson could not be confirmed/i);
    expect(container.querySelector("video")?.getAttribute("src")).toContain(encodeURIComponent(oldUrl));
  });

  it("handles an uncertain network result without switching the preview", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const { container } = renderAndUpload();
    await screen.findByText(/reload the page to check/i);
    expect(container.querySelector("video")?.getAttribute("src")).toContain(encodeURIComponent(oldUrl));
  });

  it("switches the preview only after the server confirms the saved video", async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    const { container } = renderAndUpload();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(container.querySelector("video")?.getAttribute("src")).toContain(encodeURIComponent(oldUrl));
    finish(Response.json({ lesson: { id, content: { ...content, videoUrl: newUrl } } }));
    await waitFor(() => expect(container.querySelector("video")?.getAttribute("src")).toContain(encodeURIComponent(newUrl)));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/admin/course-library/lessons/${id}`);
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual({ content: { ...content, videoUrl: newUrl } });
    expect(screen.queryByText(/saving this lesson could not be confirmed/i)).toBeNull();
  });
});
