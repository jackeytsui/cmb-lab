import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/VocalHackViewer.tsx",
  ),
  "utf8",
);

describe("Vocal Hack video source-of-truth guidance", () => {
  it("shows the guidance before every Vocal Hack sentence list", () => {
    const notice = viewer.indexOf('data-testid="vocal-hack-source-of-truth"');
    const sentenceList = viewer.indexOf("{sentences.map((sentence, idx)");

    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(sentenceList);
    expect(viewer).toContain("Video is the source of truth");
    expect(viewer).toContain(
      "If any wording, pronunciation, or meaning shown in CMB Lab differs",
    );
    expect(viewer).toContain("from the coach video, follow the coach video.");
  });
});
