import { describe, expect, it } from "vitest";
import { planManualChapterUnlock } from "@/lib/course-library-manual-unlock";

const modules = [
  { id: "chapter-1", lessonIds: ["lesson-1", "lesson-2"] },
  { id: "chapter-2", lessonIds: ["lesson-3"] },
  { id: "chapter-3", lessonIds: ["lesson-4", "lesson-5"] },
];

describe("planManualChapterUnlock", () => {
  it("keeps the selected chapter incomplete and completes only prerequisites", () => {
    const plan = planManualChapterUnlock({
      orderedModules: modules,
      targetModuleId: "chapter-3",
      completedLessonIds: [],
    });

    expect(plan.prerequisiteModuleIds).toEqual(["chapter-1", "chapter-2"]);
    expect(plan.missingLessonIds).toEqual([
      "lesson-1",
      "lesson-2",
      "lesson-3",
    ]);
    expect(plan.prerequisiteLessonIds).not.toContain("lesson-4");
  });

  it("is additive and excludes lessons that are already complete", () => {
    const plan = planManualChapterUnlock({
      orderedModules: modules,
      targetModuleId: "chapter-3",
      completedLessonIds: ["lesson-1", "lesson-3"],
    });

    expect(plan.missingLessonIds).toEqual(["lesson-2"]);
    expect(plan.alreadyCompletedLessonIds).toEqual(["lesson-1", "lesson-3"]);
  });

  it("does no work when the first chapter is selected", () => {
    const plan = planManualChapterUnlock({
      orderedModules: modules,
      targetModuleId: "chapter-1",
      completedLessonIds: [],
    });

    expect(plan.prerequisiteModuleIds).toEqual([]);
    expect(plan.missingLessonIds).toEqual([]);
  });

  it("deduplicates prerequisite lesson ids defensively", () => {
    const plan = planManualChapterUnlock({
      orderedModules: [
        { id: "chapter-1", lessonIds: ["lesson-1", "lesson-1"] },
        { id: "chapter-2", lessonIds: ["lesson-2"] },
      ],
      targetModuleId: "chapter-2",
      completedLessonIds: [],
    });

    expect(plan.missingLessonIds).toEqual(["lesson-1"]);
  });

  it("rejects a chapter that is not part of the ordered course", () => {
    expect(() =>
      planManualChapterUnlock({
        orderedModules: modules,
        targetModuleId: "other-course-chapter",
        completedLessonIds: [],
      }),
    ).toThrow("Target chapter was not found in this course");
  });
});
