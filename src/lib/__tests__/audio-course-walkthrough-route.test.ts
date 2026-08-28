import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  blobDeleteMock,
  deleteMock,
  deleteWhereMock,
  findFirstMock,
  getCurrentUserMock,
  handleUploadMock,
  hasMinimumRoleMock,
  insertMock,
  insertValuesMock,
  onConflictDoUpdateMock,
  proxyBlobMediaMock,
  userCanUseFeatureMock,
} = vi.hoisted(() => ({
  blobDeleteMock: vi.fn(),
  deleteMock: vi.fn(),
  deleteWhereMock: vi.fn(),
  findFirstMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  handleUploadMock: vi.fn(),
  hasMinimumRoleMock: vi.fn(),
  insertMock: vi.fn(),
  insertValuesMock: vi.fn(),
  onConflictDoUpdateMock: vi.fn(),
  proxyBlobMediaMock: vi.fn(),
  userCanUseFeatureMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@vercel/blob", () => ({ del: blobDeleteMock }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: handleUploadMock }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
  hasMinimumRole: hasMinimumRoleMock,
}));
vi.mock("@/lib/feature-access", () => ({
  userCanUseFeature: userCanUseFeatureMock,
}));
vi.mock("@/lib/blob-media-proxy", () => ({
  proxyBlobMedia: proxyBlobMediaMock,
}));
vi.mock("@/db", () => ({
  db: {
    query: { appSettings: { findFirst: findFirstMock } },
    insert: insertMock,
    delete: deleteMock,
  },
}));

import {
  DELETE,
  GET as GET_ADMIN,
  PUT,
} from "@/app/api/admin/audio-course/walkthrough/route";
import { POST as POST_UPLOAD } from "@/app/api/admin/audio-course/walkthrough/upload/route";
import { GET as GET_STREAM } from "@/app/api/audio-courses/walkthrough/route";

const VIDEO_URL =
  "https://store.private.blob.vercel-storage.com/audio-course-walkthrough/guide.mp4";

describe("Audio Course walkthrough Blob routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    hasMinimumRoleMock.mockResolvedValue(true);
    getCurrentUserMock.mockResolvedValue({
      id: "user-1",
      role: "student",
      deletedAt: null,
    });
    userCanUseFeatureMock.mockResolvedValue(true);
    findFirstMock.mockResolvedValue(null);
    onConflictDoUpdateMock.mockResolvedValue(undefined);
    insertValuesMock.mockReturnValue({
      onConflictDoUpdate: onConflictDoUpdateMock,
    });
    insertMock.mockReturnValue({ values: insertValuesMock });
    deleteWhereMock.mockResolvedValue(undefined);
    deleteMock.mockReturnValue({ where: deleteWhereMock });
    blobDeleteMock.mockResolvedValue(undefined);
    proxyBlobMediaMock.mockResolvedValue(new Response("video"));
  });

  it("returns the configured private Blob URL without public caching", async () => {
    findFirstMock.mockResolvedValue({ value: VIDEO_URL });

    const response = await GET_ADMIN();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ videoUrl: VIDEO_URL });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("rejects public or non-Blob walkthrough URLs", async () => {
    const response = await PUT(
      new NextRequest("http://localhost/api/admin/audio-course/walkthrough", {
        method: "PUT",
        body: JSON.stringify({ videoUrl: "https://example.com/guide.mp4" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("publishes the new Blob and cleans up the replaced Blob", async () => {
    const oldUrl = VIDEO_URL.replace("guide.mp4", "old.mp4");
    findFirstMock.mockResolvedValue({ value: oldUrl });

    const response = await PUT(
      new NextRequest("http://localhost/api/admin/audio-course/walkthrough", {
        method: "PUT",
        body: JSON.stringify({ videoUrl: VIDEO_URL }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    expect(insertValuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "audio_course_walkthrough_blob_url",
        value: VIDEO_URL,
      }),
    );
    expect(blobDeleteMock).toHaveBeenCalledWith(oldUrl, {
      token: "test-token",
    });
  });

  it("removes the setting before deleting its stored Blob", async () => {
    findFirstMock.mockResolvedValue({ value: VIDEO_URL });

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(deleteWhereMock).toHaveBeenCalledOnce();
    expect(blobDeleteMock).toHaveBeenCalledWith(VIDEO_URL, {
      token: "test-token",
    });
  });

  it("issues a private client-upload token only for the walkthrough folder", async () => {
    handleUploadMock.mockImplementation(async ({ onBeforeGenerateToken }) => {
      const tokenOptions = await onBeforeGenerateToken(
        "audio-course-walkthrough/guide.mp4",
      );
      expect(tokenOptions).toEqual(
        expect.objectContaining({
          addRandomSuffix: true,
          maximumSizeInBytes: 500 * 1024 * 1024,
        }),
      );
      return { type: "blob.generate-client-token", clientToken: "token" };
    });

    const response = await POST_UPLOAD(
      new NextRequest(
        "http://localhost/api/admin/audio-course/walkthrough/upload",
        {
          method: "POST",
          body: JSON.stringify({ type: "blob.generate-client-token" }),
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    expect(response.status).toBe(200);
    expect(handleUploadMock).toHaveBeenCalledOnce();
  });

  it("streams the private Blob only to users with Audio Courses access", async () => {
    findFirstMock.mockResolvedValue({ value: VIDEO_URL });
    const request = new NextRequest(
      "http://localhost/api/audio-courses/walkthrough",
      { headers: { Range: "bytes=0-" } },
    );

    const response = await GET_STREAM(request);

    expect(response.status).toBe(200);
    expect(proxyBlobMediaMock).toHaveBeenCalledWith(
      request,
      VIDEO_URL,
      expect.objectContaining({ fallbackContentType: "video/mp4" }),
    );
  });

  it("blocks walkthrough streaming without the feature entitlement", async () => {
    userCanUseFeatureMock.mockResolvedValue(false);

    const response = await GET_STREAM(
      new NextRequest("http://localhost/api/audio-courses/walkthrough"),
    );

    expect(response.status).toBe(403);
    expect(proxyBlobMediaMock).not.toHaveBeenCalled();
  });
});
