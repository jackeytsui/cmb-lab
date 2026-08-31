import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  viewer: { id: "student", role: "student" } as object | null,
  staff: false, signed: true, access: true, rows: [] as unknown[],
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mocks.viewer,
  hasCourseContentAccess: async () => mocks.staff,
}));
vi.mock("@/lib/signed-media-url", () => ({ verifySignedMediaPath: () => mocks.signed }));
vi.mock("@/lib/course-library-lesson-access", () => ({ canUserAccessCourseLibraryLesson: async () => mocks.access }));
vi.mock("@/lib/private-media-playback", () => ({ privateMediaPlaybackRedirect: mocks.redirect }));
vi.mock("@/db", () => ({ db: { select: () => {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where"]) query[method] = () => query;
  query.limit = async () => mocks.rows;
  return query;
} } }));

import { GET as mainVideo } from "@/app/api/course-library/stream/[lessonId]/route";
import { GET as vocalVideo } from "@/app/api/course-library/vocal-hack-video/[lessonId]/route";
import { GET as adminPreview } from "@/app/api/admin/course-library/blob-preview/route";

const blob = "https://store123.private.blob.vercel-storage.com/video.mp4";
const context = { params: Promise.resolve({ lessonId: "c6207ff8-d4b4-4576-a84d-685264fef02e" }) };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer = { id: "student", role: "student" };
  mocks.staff = false; mocks.signed = true; mocks.access = true;
  mocks.rows = [{ lessonType: "video", content: { videoUrl: blob } }];
  mocks.redirect.mockResolvedValue(new Response(null, { status: 307, headers: { Location: "https://media.test/signed" } }));
});

describe.each([["main", mainVideo], ["vocal", vocalVideo]] as const)("%s protected video route", (_name, handler) => {
  const request = (headers = {}) => new NextRequest("https://app.test/media?sentence=s1", { headers });
  beforeEach(() => {
    if (_name === "vocal") mocks.rows = [{ lessonType: "vocal_hack", content: { sentences: [{ id: "s1", videoUrl: blob }] } }];
  });
  it("does not issue media URLs without a session", async () => {
    mocks.viewer = null;
    expect((await handler(request(), context)).status).toBe(401);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("rejects expired page signatures", async () => {
    mocks.signed = false;
    expect((await handler(request(), context)).status).toBe(403);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("rejects direct document navigation", async () => {
    expect((await handler(request({ "sec-fetch-dest": "document" }), context)).status).toBe(403);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("does not grant access to a lesson outside the student's entitlements", async () => {
    mocks.access = false;
    expect((await handler(request(), context)).status).toBe(404);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("redirects only after all access checks pass", async () => {
    expect((await handler(request(), context)).status).toBe(307);
    expect(mocks.redirect).toHaveBeenCalledWith(blob, expect.stringMatching(/^course-library\//));
  });
});

describe("course editor private previews", () => {
  const request = () => new NextRequest(`https://app.test/media?url=${encodeURIComponent(blob)}`);
  it("still rejects students before signing", async () => {
    expect((await adminPreview(request())).status).toBe(403);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("uses direct streaming for staff with fresh replaceable-upload bytes", async () => {
    mocks.staff = true;
    expect((await adminPreview(request())).status).toBe(307);
    expect(mocks.redirect).toHaveBeenCalledWith(blob, "admin/blob-preview", { useCache: false });
  });
});
