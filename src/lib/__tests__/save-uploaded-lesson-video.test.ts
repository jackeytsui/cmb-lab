import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveUploadedLessonVideo } from "../save-uploaded-lesson-video";

const fetchMock = vi.fn();
const id = "lesson-1";
const content = {
  videoUrl: "https://test.private.blob.vercel-storage.com/course-library/video/new.mp4",
  description: "Keep this description",
  thumbnailUrl: "https://example.com/thumbnail.jpg",
  attachments: [{ name: "Notes", url: "https://example.com/notes.pdf" }],
};

beforeEach(() => vi.stubGlobal("fetch", fetchMock));
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

async function expectUnconfirmed() {
  expect(await saveUploadedLessonVideo(id, content)).toEqual({
    ok: false,
    error: "Video uploaded, but saving this lesson could not be confirmed. Reload the page to check before trying again.",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
}

describe("saveUploadedLessonVideo", () => {
  it("confirms the matching lesson and URL, preserving all other content", async () => {
    fetchMock.mockResolvedValue(Response.json({ lesson: { id, content } }));
    expect(await saveUploadedLessonVideo(id, content)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(`/api/admin/course-library/lessons/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  });

  it.each([400, 401, 403, 404, 413, 429, 500, 503])("rejects HTTP %i without retrying", async (status) => {
    fetchMock.mockResolvedValue(new Response("Save failed", { status }));
    await expectUnconfirmed();
  });

  it.each([
    null,
    {},
    { lesson: { id: "different-lesson", content } },
    { lesson: { id, content: {} } },
    { lesson: { id, content: { videoUrl: "https://example.com/old.mp4" } } },
  ])("requires a matching saved lesson in a successful response: %j", async (body) => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expectUnconfirmed();
  });

  it("handles non-JSON responses such as a redirected sign-in page", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Sign in</html>"));
    await expectUnconfirmed();
  });

  it("handles network failure without retrying an uncertain write", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expectUnconfirmed();
  });

  it.each([undefined, null, "", "   "])("never saves a missing video URL: %j", async (videoUrl) => {
    expect(await saveUploadedLessonVideo(id, { ...content, videoUrl })).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
