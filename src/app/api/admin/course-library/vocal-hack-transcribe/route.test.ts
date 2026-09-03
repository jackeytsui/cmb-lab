import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  transcribe: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ hasCourseContentAccess: mocks.access }));
vi.mock("@/lib/vocal-hack-transcription", () => ({
  transcribeVocalHackVideo: mocks.transcribe,
}));

import { POST } from "./route";

const VIDEO_URL =
  "https://store123.private.blob.vercel-storage.com/course-library/video/coach.mp4";

function request(body: unknown) {
  return new NextRequest(
    "http://localhost/api/admin/course-library/vocal-hack-transcribe",
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    },
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue(true);
  mocks.transcribe.mockResolvedValue({
    rawTranscript: "你好",
    chinese: "你好",
    pinyin: "nei5 hou2",
    english: "Hello",
  });
});

describe("course-library Vocal Hack transcription route", () => {
  it("only allows course content editors", async () => {
    mocks.access.mockResolvedValue(false);

    const response = await POST(
      request({ videoUrl: VIDEO_URL, language: "mandarin" }),
    );

    expect(response.status).toBe(403);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it.each([
    "https://evil.test/course-library/video/coach.mp4",
    "http://store123.private.blob.vercel-storage.com/course-library/video/coach.mp4",
    "https://store123.private.blob.vercel-storage.com/course-library/file/coach.mp4",
  ])("rejects non-course-video URLs: %s", async (videoUrl) => {
    const response = await POST(request({ videoUrl, language: "mandarin" }));

    expect(response.status).toBe(400);
    expect(mocks.transcribe).not.toHaveBeenCalled();
  });

  it("uses Cantonese transcription and returns generated editable rows", async () => {
    const response = await POST(
      request({ videoUrl: VIDEO_URL, language: "cantonese" }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      chinese: "你好",
      pinyin: "nei5 hou2",
      english: "Hello",
    });
    expect(mocks.transcribe).toHaveBeenCalledWith({
      videoUrl: VIDEO_URL,
      language: "cantonese",
      context: "Course Library Vocal Hack (Canto) upload",
    });
  });
});
