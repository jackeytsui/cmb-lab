import { describe, expect, it } from "vitest";
import {
  planManualChapterUnlock,
  planManualLessonPosition,
} from "@/lib/course-library-manual-unlock";

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

describe("planManualLessonPosition", () => {
  it("moves forward by completing only missing prerequisites", () => {
    const plan = planManualLessonPosition({
      orderedModules: modules,
      targetLessonId: "lesson-4",
      completedLessonIds: ["lesson-1"],
    });

    expect(plan.lessonIdsBeforeTarget).toEqual([
      "lesson-1",
      "lesson-2",
      "lesson-3",
    ]);
    expect(plan.missingPrerequisiteLessonIds).toEqual([
      "lesson-2",
      "lesson-3",
    ]);
    expect(plan.completedLessonIdsToReopen).toEqual([]);
  });

  it("moves backward by reopening the target and every later completion", () => {
    const plan = planManualLessonPosition({
      orderedModules: modules,
      targetLessonId: "lesson-3",
      completedLessonIds: [
        "lesson-1",
        "lesson-2",
        "lesson-3",
        "lesson-4",
        "lesson-5",
      ],
    });

    expect(plan.missingPrerequisiteLessonIds).toEqual([]);
    expect(plan.completedLessonIdsToReopen).toEqual([
      "lesson-3",
      "lesson-4",
      "lesson-5",
    ]);
  });

  it("repairs mixed progress on both sides of the selected lesson", () => {
    const plan = planManualLessonPosition({
      orderedModules: modules,
      targetLessonId: "lesson-3",
      completedLessonIds: ["lesson-1", "lesson-3", "lesson-5"],
    });

    expect(plan.missingPrerequisiteLessonIds).toEqual(["lesson-2"]);
    expect(plan.completedLessonIdsToReopen).toEqual([
      "lesson-3",
      "lesson-5",
    ]);
  });

  it("is a no-op when the selected lesson is already the exact next lesson", () => {
    const plan = planManualLessonPosition({
      orderedModules: modules,
      targetLessonId: "lesson-3",
      completedLessonIds: ["lesson-1", "lesson-2"],
    });

    expect(plan.missingPrerequisiteLessonIds).toEqual([]);
    expect(plan.completedLessonIdsToReopen).toEqual([]);
  });

  it("rejects a lesson outside the selected course", () => {
    expect(() =>
      planManualLessonPosition({
        orderedModules: modules,
        targetLessonId: "other-course-lesson",
        completedLessonIds: [],
      }),
    ).toThrow("Target lesson was not found in this course");
  });
});
