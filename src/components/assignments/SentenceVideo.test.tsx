import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SentenceVideo } from "./SentenceVideo";

describe("SentenceVideo", () => {
  it("offers inline expansion without using browser fullscreen", () => {
    const onExpandedChange = vi.fn();
    const html = renderToStaticMarkup(
      <SentenceVideo
        src="/coach-video"
        expanded={false}
        onExpandedChange={onExpandedChange}
      />,
    );

    expect(html).toContain("Enlarge video");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("requestFullscreen");
    expect(onExpandedChange).not.toHaveBeenCalled();
  });
});
