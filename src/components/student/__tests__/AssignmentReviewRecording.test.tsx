import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssignmentReviewRecording } from "@/components/student/AssignmentReviewRecording";

describe("AssignmentReviewRecording", () => {
  it("renders Loom share links as playable embeds", () => {
    const html = renderToStaticMarkup(
      <AssignmentReviewRecording url="https://www.loom.com/share/b3132d7c3fbb4c10bd7466c4c39c5f2b" />,
    );

    expect(html).toContain(
      'src="https://www.loom.com/embed/b3132d7c3fbb4c10bd7466c4c39c5f2b"',
    );
    expect(html).toContain('title="Review recording"');
    expect(html).toContain("Review Recording");
  });

  it("keeps unsupported recording providers as safe external links", () => {
    const html = renderToStaticMarkup(
      <AssignmentReviewRecording url="https://fathom.video/share/example" />,
    );

    expect(html).toContain('href="https://fathom.video/share/example"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).not.toContain("<iframe");
  });
});
