import { describe, expect, it } from "vitest";
import { extractEmbedUrl, looksLikeIframeSnippet } from "@/lib/embed";

describe("embed normalization", () => {
  it("adds embedded=true to Google Forms view URLs", () => {
    expect(
      extractEmbedUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform",
      ),
    ).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform?embedded=true",
    );
  });

  it("keeps existing Google Forms embed URLs intact", () => {
    expect(
      extractEmbedUrl(
        "https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform?embedded=true",
      ),
    ).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform?embedded=true",
    );
  });

  it("extracts iframe src URLs", () => {
    expect(
      extractEmbedUrl(
        '<iframe src="https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform"></iframe>',
      ),
    ).toBe(
      "https://docs.google.com/forms/d/e/1FAIpQLSc6MdqnEq7U-7pCUeuo_crNokXFmHcPGYOP3IU5VApLubXt2A/viewform?embedded=true",
    );
  });

  it("detects iframe snippets", () => {
    expect(looksLikeIframeSnippet("<iframe src='x'></iframe>")).toBe(true);
    expect(looksLikeIframeSnippet("https://example.com")).toBe(false);
  });
});
