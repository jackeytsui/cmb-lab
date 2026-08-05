import { describe, expect, it } from "vitest";
import {
  isPrivateVercelBlobUrl,
  mediaExtension,
  resolvedVideoAskMediaUrl,
  videoAskBlobPath,
} from "../media-storage";

describe("VideoAsk media storage", () => {
  it("recognizes only HTTPS private Vercel Blob URLs", () => {
    expect(
      isPrivateVercelBlobUrl(
        "https://store.private.blob.vercel-storage.com/videoask/file.mp4",
      ),
    ).toBe(true);
    expect(
      isPrivateVercelBlobUrl(
        "https://store.public.blob.vercel-storage.com/videoask/file.mp4",
      ),
    ).toBe(false);
    expect(isPrivateVercelBlobUrl("https://media.videoask.com/file.mp4")).toBe(
      false,
    );
  });

  it("selects stable file extensions from content types", () => {
    expect(mediaExtension("video/mp4")).toBe("mp4");
    expect(mediaExtension("audio/mpeg; charset=binary")).toBe("mp3");
    expect(mediaExtension("video/webm")).toBe("webm");
    expect(mediaExtension(null)).toBe("mp4");
  });

  it("builds deterministic, storage-safe paths", () => {
    expect(
      videoAskBlobPath({
        organizationId: "org / one",
        sourceMediaId: "media:123",
        sourceMediaKey: "fallback-key",
        contentType: "video/mp4",
      }),
    ).toBe("videoask/org-one/media-123.mp4");
  });

  it("reuses a completed durable copy for later deduplicated steps", () => {
    const sourceUrl = "https://media.videoask.com/temporary.mp4";
    const destinationUrl =
      "https://store.private.blob.vercel-storage.com/videoask/durable.mp4";

    expect(
      resolvedVideoAskMediaUrl(sourceUrl, {
        status: "ready",
        destinationUrl,
      }),
    ).toBe(destinationUrl);
    expect(
      resolvedVideoAskMediaUrl(sourceUrl, {
        status: "pending",
        destinationUrl,
      }),
    ).toBe(sourceUrl);
    expect(
      resolvedVideoAskMediaUrl(sourceUrl, {
        status: "ready",
        destinationUrl: null,
      }),
    ).toBe(sourceUrl);
  });
});
