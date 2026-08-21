import { describe, expect, it } from "vitest";
import {
  parseRecordingEmbed,
  sanitizeRecordingUrl,
} from "@/lib/recording-embed";

describe("sanitizeRecordingUrl", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "file:///etc/passwd",
    "//example.com/video",
    "not a url",
  ])("rejects unsafe or incomplete URL %s", (value) => {
    expect(sanitizeRecordingUrl(value)).toBeNull();
  });

  it("trims and normalizes http(s) URLs", () => {
    expect(sanitizeRecordingUrl("  https://example.com/recording?q=1  ")).toBe(
      "https://example.com/recording?q=1",
    );
    expect(sanitizeRecordingUrl("http://example.com")).toBe(
      "http://example.com/",
    );
  });
});

describe("parseRecordingEmbed", () => {
  it("converts supported recording services to safe embed URLs", () => {
    expect(parseRecordingEmbed("https://www.loom.com/share/abc123")).toEqual({
      kind: "loom",
      url: "https://www.loom.com/share/abc123",
      embedUrl: "https://www.loom.com/embed/abc123",
    });
    expect(parseRecordingEmbed("https://youtu.be/CcHWoRtK0fw")).toEqual({
      kind: "youtube",
      url: "https://youtu.be/CcHWoRtK0fw",
      embedUrl: "https://www.youtube.com/embed/CcHWoRtK0fw",
    });
  });

  it("keeps other http(s) links clickable without embedding them", () => {
    expect(parseRecordingEmbed("https://fathom.video/share/example")).toEqual({
      kind: "link",
      url: "https://fathom.video/share/example",
    });
  });
});
