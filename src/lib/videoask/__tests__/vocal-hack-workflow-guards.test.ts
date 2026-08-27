import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isVocalHackPlacementPublicationLocked } from "@/lib/videoask/vocal-hack-workflow-guards";

const workflow = readFileSync(
  path.join(process.cwd(), "src/lib/videoask/vocal-hack-workflow.ts"),
  "utf8",
);

describe("Vocal Hack preparation publication guard", () => {
  it("locks both normal and partially inconsistent published states", () => {
    expect(
      isVocalHackPlacementPublicationLocked({
        status: "published",
        publishedLessonId: "lesson-id",
      }),
    ).toBe(true);
    expect(
      isVocalHackPlacementPublicationLocked({
        status: "published",
        publishedLessonId: null,
      }),
    ).toBe(true);
    expect(
      isVocalHackPlacementPublicationLocked({
        status: "ready_for_review",
        publishedLessonId: "lesson-id",
      }),
    ).toBe(true);
  });

  it("keeps unpublished and rolled-back review drafts writable", () => {
    expect(
      isVocalHackPlacementPublicationLocked({
        status: "planned",
        publishedLessonId: null,
      }),
    ).toBe(false);
    expect(
      isVocalHackPlacementPublicationLocked({
        status: "rolled_back",
        publishedLessonId: null,
      }),
    ).toBe(false);
  });

  it("excludes locked placements before source sentence upserts", () => {
    expect(workflow).toContain(
      "if (previous && isVocalHackPlacementPublicationLocked(previous))",
    );
    expect(workflow).toContain(
      "writablePlacements.map((placement) => [placement.formImportId, placement])",
    );
    expect(workflow).toContain(
      "inArray(videoaskStepImports.formImportId, writableFormIds)",
    );
  });
});
