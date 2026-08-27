import { NextRequest } from "next/server";
import { afterEach, describe, it, expect, vi } from "vitest";
import { get } from "@vercel/blob";
import {
  clampRangeHeader,
  CHUNK_BYTES,
  INITIAL_CHUNK_BYTES,
  normalizeContentRange,
  proxyBlobMedia,
} from "@/lib/blob-media-proxy";

vi.mock("@vercel/blob", () => ({ get: vi.fn() }));

function blobGetResult(
  body: string,
  headers: Record<string, string>,
) {
  const response = new Response(body, { headers });
  return {
    statusCode: 200 as const,
    stream: response.body!,
    headers: response.headers,
    blob: {
      url: "https://store.private.blob.vercel-storage.com/video.mp4",
      downloadUrl:
        "https://store.private.blob.vercel-storage.com/video.mp4?download=1",
      pathname: "video.mp4",
      contentType: headers["Content-Type"] ?? "application/octet-stream",
      contentDisposition: "",
      cacheControl: "",
      size: Number(headers["Content-Length"] ?? body.length),
      uploadedAt: new Date(0),
      etag: "",
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(get).mockReset();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("clampRangeHeader", () => {
  it("clamps open-ended ranges to one chunk", () => {
    expect(clampRangeHeader("bytes=0-")).toBe(
      `bytes=0-${INITIAL_CHUNK_BYTES - 1}`,
    );
    expect(clampRangeHeader("bytes=1000-")).toBe(
      `bytes=1000-${1000 + CHUNK_BYTES - 1}`,
    );
  });

  it("passes bounded ranges no larger than a chunk through untouched", () => {
    expect(clampRangeHeader("bytes=0-1")).toBe("bytes=0-1");
    expect(clampRangeHeader("bytes=500-999")).toBe("bytes=500-999");
  });

  it("clamps large bounded ranges to one chunk", () => {
    expect(clampRangeHeader(`bytes=100-${100 + CHUNK_BYTES * 2}`)).toBe(
      `bytes=100-${100 + CHUNK_BYTES - 1}`,
    );
    expect(clampRangeHeader(`bytes=0-${CHUNK_BYTES * 2}`)).toBe(
      `bytes=0-${INITIAL_CHUNK_BYTES - 1}`,
    );
  });

  it("passes invalid reversed ranges through for upstream validation", () => {
    expect(clampRangeHeader("bytes=999-500")).toBe("bytes=999-500");
  });

  it("passes suffix ranges through untouched (MP4 moov-at-end fetches)", () => {
    expect(clampRangeHeader("bytes=-500")).toBe("bytes=-500");
  });

  it("leaves unparseable values for upstream to handle", () => {
    expect(clampRangeHeader("bytes=abc")).toBe("bytes=abc");
    expect(clampRangeHeader("items=0-10")).toBe("items=0-10");
  });
});

describe("normalizeContentRange", () => {
  it("repairs Vercel Blob tail ranges reported relative to the offset", () => {
    expect(
      normalizeContentRange("bytes 193069056-797056/797057"),
    ).toEqual({
      value: "bytes 193069056-193866112/193866113",
      contentLength: 797057,
    });
  });

  it("preserves valid absolute ranges", () => {
    expect(normalizeContentRange("bytes 32768-4227071/193866113")).toEqual({
      value: "bytes 32768-4227071/193866113",
      contentLength: CHUNK_BYTES,
    });
  });

  it("rejects malformed ranges it cannot safely repair", () => {
    expect(normalizeContentRange("bytes 100-50/500")).toBeNull();
    expect(normalizeContentRange("not-a-range")).toBeNull();
  });
});

describe("proxyBlobMedia", () => {
  it("forwards a clamped range and prevents partial-response caching", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    const getMock = vi.mocked(get).mockResolvedValue(
      blobGetResult("chunk", {
        "Content-Type": "video/mp4",
        "Content-Length": "5",
        "Content-Range": "bytes 0-4/100",
        "Accept-Ranges": "bytes",
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    const request = new NextRequest("https://app.test/media", {
      headers: { Range: "bytes=0-" },
    });
    const response = await proxyBlobMedia(
      request,
      "https://store.private.blob.vercel-storage.com/video.mp4",
      { fallbackContentType: "video/mp4", label: "test" },
    );

    expect(getMock).toHaveBeenCalledWith(
      "https://store.private.blob.vercel-storage.com/video.mp4",
      {
        access: "private",
        token: "test-token",
        useCache: false,
        headers: {
          Range: `bytes=0-${INITIAL_CHUNK_BYTES - 1}`,
        },
      },
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-4/100");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("chunk");
  });

  it("keeps a complete response privately cacheable", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    vi.mocked(get).mockResolvedValue(
      blobGetResult("complete", { "Content-Type": "video/mp4" }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await proxyBlobMedia(
      new NextRequest("https://app.test/media"),
      "https://store.private.blob.vercel-storage.com/video.mp4",
      { fallbackContentType: "video/mp4", label: "test" },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "private, max-age=3600",
    );
  });

  it("repairs a relative tail Content-Range before returning it", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    vi.mocked(get).mockResolvedValue(
      blobGetResult("tail", {
        "Content-Type": "video/mp4",
        "Content-Range": "bytes 193069056-797056/797057",
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    const response = await proxyBlobMedia(
      new NextRequest("https://app.test/media", {
        headers: { Range: "bytes=193069056-" },
      }),
      "https://store.private.blob.vercel-storage.com/video.mp4",
      { fallbackContentType: "video/mp4", label: "test" },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(
      "bytes 193069056-193866112/193866113",
    );
    expect(response.headers.get("content-length")).toBe("797057");
  });
});
