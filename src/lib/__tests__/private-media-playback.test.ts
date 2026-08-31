import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueSignedToken, presignUrl } from "@vercel/blob";
import { privateMediaPlaybackRedirect } from "@/lib/private-media-playback";
import { SIGNED_MEDIA_TTL_SECONDS } from "@/lib/signed-media-url";

vi.mock("@vercel/blob", () => ({ issueSignedToken: vi.fn(), presignUrl: vi.fn() }));
const blobUrl = "https://store123.private.blob.vercel-storage.com/course-library/video/Getting%20the%20Bill.mp4";

beforeEach(() => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-token");
  vi.mocked(issueSignedToken).mockResolvedValue({} as Awaited<ReturnType<typeof issueSignedToken>>);
  vi.mocked(presignUrl).mockResolvedValue({ presignedUrl: `${blobUrl}?signed=test` });
});
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); vi.restoreAllMocks(); });

describe("private playback delivery", () => {
  it("issues a time-limited, single-file read URL, not a byte proxy or store token", async () => {
    const start = Date.now();
    const response = await privateMediaPlaybackRedirect(blobUrl, "test");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${blobUrl}?signed=test`);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("location")).not.toContain("test-token");
    const options = vi.mocked(issueSignedToken).mock.calls[0][0];
    expect(options).toEqual(expect.objectContaining({
      token: "test-token", pathname: "course-library/video/Getting the Bill.mp4",
      operations: ["get"], abortSignal: expect.any(AbortSignal),
    }));
    expect(options.validUntil).toBeGreaterThanOrEqual(start + SIGNED_MEDIA_TTL_SECONDS * 1000);
    expect(options.validUntil).toBeLessThanOrEqual(Date.now() + SIGNED_MEDIA_TTL_SECONDS * 1000);
    expect(presignUrl).toHaveBeenCalledWith({}, expect.objectContaining({
      pathname: options.pathname, validUntil: options.validUntil,
      access: "private", operation: "get", useCache: true,
    }));
  });

  it("bypasses cached bytes only for replaceable admin previews", async () => {
    await privateMediaPlaybackRedirect(blobUrl, "test", { useCache: false });
    expect(presignUrl).toHaveBeenCalledWith({}, expect.objectContaining({ useCache: false }));
  });

  it.each([
    "https://evil.test/video.mp4", "http://store123.private.blob.vercel-storage.com/v.mp4",
    "https://store123.private.blob.vercel-storage.com.evil.test/v.mp4",
    "https://user:password@store123.private.blob.vercel-storage.com/v.mp4",
    "https://store123.private.blob.vercel-storage.com/*",
    "https://store123.private.blob.vercel-storage.com/%2A", "not-a-url",
  ])("does not sign invalid or wildcard paths: %s", async (url) => {
    expect((await privateMediaPlaybackRedirect(url, "test")).status).toBe(502);
    expect(issueSignedToken).not.toHaveBeenCalled();
  });

  it.each(["", "token\ninvalid"])("rejects missing/malformed server credentials", async (token) => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", token);
    expect((await privateMediaPlaybackRedirect(blobUrl, "test")).status).toBe(500);
    expect(issueSignedToken).not.toHaveBeenCalled();
  });

  it("does not issue a link to a different store", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(presignUrl).mockResolvedValue({ presignedUrl: "https://other.private.blob.vercel-storage.com/video.mp4" });
    expect((await privateMediaPlaybackRedirect(blobUrl, "test")).status).toBe(502);
  });

  it("contains signing failures without leaking credentials", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(issueSignedToken).mockRejectedValue(new Error("secret-token-and-url"));
    const response = await privateMediaPlaybackRedirect(blobUrl, "test");
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret-token");
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
  });
});
