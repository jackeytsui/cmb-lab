import { beforeEach, describe, expect, it, vi } from "vitest";

const fixWebmMetaInfo = vi.fn<(blob: Blob) => Promise<Blob>>();

vi.mock("fix-webm-metainfo", () => ({
  default: fixWebmMetaInfo,
}));

import { makeWebmSeekable } from "@/lib/seekable-webm";

describe("makeWebmSeekable", () => {
  beforeEach(() => {
    fixWebmMetaInfo.mockReset();
  });

  it.each(["audio/webm", "audio/webm;codecs=opus", "video/webm"])(
    "repairs %s recordings",
    async (type) => {
      const raw = new Blob(["raw"], { type });
      const repaired = new Blob(["seekable"], { type });
      fixWebmMetaInfo.mockResolvedValue(repaired);

      await expect(makeWebmSeekable(raw)).resolves.toBe(repaired);
      expect(fixWebmMetaInfo).toHaveBeenCalledWith(raw);
    },
  );

  it("leaves non-WebM uploads untouched", async () => {
    const mp4 = new Blob(["audio"], { type: "audio/mp4" });

    await expect(makeWebmSeekable(mp4)).resolves.toBe(mp4);
    expect(fixWebmMetaInfo).not.toHaveBeenCalled();
  });

  it("rejects an empty repair result", async () => {
    const raw = new Blob(["raw"], { type: "audio/webm" });
    fixWebmMetaInfo.mockResolvedValue(new Blob([], { type: "audio/webm" }));

    await expect(makeWebmSeekable(raw)).rejects.toThrow("empty recording");
  });
});
