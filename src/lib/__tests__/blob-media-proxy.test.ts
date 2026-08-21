import { NextRequest } from "next/server";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  clampRangeHeader,
  CHUNK_BYTES,
  normalizeContentRange,
  proxyBlobMedia,
} from "@/lib/blob-media-proxy";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe("clampRangeHeader", () => {
  it("clamps open-ended ranges to one chunk", () => {
    expect(clampRangeHeader("bytes=0-")).toBe(`bytes=0-${CHUNK_BYTES - 1}`);
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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("chunk", {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": "5",
          "Content-Range": "bytes 0-4/100",
          "Accept-Ranges": "bytes",
        },
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

    expect(fetchMock).toHaveBeenCalledWith(
      "https://store.private.blob.vercel-storage.com/video.mp4",
      {
        headers: {
          Authorization: "Bearer test-token",
          Range: `bytes=0-${CHUNK_BYTES - 1}`,
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("complete", {
        status: 200,
        headers: { "Content-Type": "video/mp4" },
      }),
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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("tail", {
        status: 206,
        headers: {
          "Content-Type": "video/mp4",
          "Content-Range": "bytes 193069056-797056/797057",
        },
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
