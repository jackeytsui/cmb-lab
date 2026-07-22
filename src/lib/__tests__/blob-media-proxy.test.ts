import { describe, it, expect } from "vitest";
import { clampRangeHeader, CHUNK_BYTES } from "@/lib/blob-media-proxy";

describe("clampRangeHeader", () => {
  it("clamps open-ended ranges to one chunk", () => {
    expect(clampRangeHeader("bytes=0-")).toBe(`bytes=0-${CHUNK_BYTES - 1}`);
    expect(clampRangeHeader("bytes=1000-")).toBe(
      `bytes=1000-${1000 + CHUNK_BYTES - 1}`,
    );
  });

  it("passes bounded ranges through untouched (Safari's normal pattern)", () => {
    expect(clampRangeHeader("bytes=0-1")).toBe("bytes=0-1");
    expect(clampRangeHeader("bytes=500-999")).toBe("bytes=500-999");
  });

  it("passes suffix ranges through untouched (MP4 moov-at-end fetches)", () => {
    expect(clampRangeHeader("bytes=-500")).toBe("bytes=-500");
  });

  it("leaves unparseable values for upstream to handle", () => {
    expect(clampRangeHeader("bytes=abc")).toBe("bytes=abc");
    expect(clampRangeHeader("items=0-10")).toBe("items=0-10");
  });
});
