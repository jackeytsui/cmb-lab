import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(
  "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/page.tsx",
  "utf8",
);

describe("Course Library form embeds", () => {
  it("normalizes legacy embed URLs at render time and offers an external fallback", () => {
    expect(viewer).toContain('import { extractEmbedUrl } from "@/lib/embed"');
    expect(viewer).toContain("extractEmbedUrl(content.embedUrl)");
    expect(viewer).toContain("src={formEmbedUrl}");
    expect(viewer).toContain("Open in a new tab");
  });
});
