import { describe, expect, it } from "vitest";
import { PLATFORM_ROLES } from "@/lib/platform-roles";
import { canAccessCourseLibraryModuleByProgress, getCurrentCourseLibraryModuleIndex } from "@/lib/course-library-progression";
import { displayedCompletedLessonCount, displayedCompletedLessonIds, hasDefaultCourseCompletion } from "@/lib/staff-course-progress";

const lessons = [{ id: "one" }, { id: "two" }, { id: "newly-added" }];
const recorded = [{ lessonId: "one", completedAt: new Date("2026-01-01") }];

describe("staff default course completion", () => {
  it("applies only to admin and coach platform roles", () => {
    expect(PLATFORM_ROLES.filter(hasDefaultCourseCompletion)).toEqual(["coach", "admin"]);
    for (const role of [null, undefined, "Admin", "administrator", { role: "admin" }]) {
      expect(hasDefaultCourseCompletion(role)).toBe(false);
    }
  });

  it.each(["admin", "coach"])("shows all existing and newly added lessons as complete for %s without records", (role) => {
    expect([...displayedCompletedLessonIds(role, lessons, [])]).toEqual(["one", "two", "newly-added"]);
    expect(displayedCompletedLessonCount(role, 3, 0)).toBe(3);
    expect(displayedCompletedLessonCount(role, 0, 0)).toBe(0);
  });

  it.each(["student", "operations", "consultant", "temp"])("preserves actual progress for %s", (role) => {
    expect([...displayedCompletedLessonIds(role, lessons, recorded)]).toEqual(["one"]);
    expect(displayedCompletedLessonCount(role, 3, 1)).toBe(1);
  });

  it("does not alter records when promoted to staff or viewed again as a student", () => {
    const original = structuredClone(recorded);
    expect(displayedCompletedLessonIds("coach", lessons, recorded).size).toBe(3);
    expect(displayedCompletedLessonIds("student", lessons, recorded).size).toBe(1);
    expect(recorded).toEqual(original);
  });

  it("ignores completion rows for deleted or unrelated lessons", () => {
    expect(displayedCompletedLessonIds("student", lessons, [
      ...recorded, { lessonId: "deleted", completedAt: new Date() },
      { lessonId: "two", completedAt: null },
    ]).size).toBe(1);
  });

  it("unlocks the entire roadmap for staff and retains the student sequence", () => {
    const forRole = (role: string) => lessons.map((lesson) => ({
      id: lesson.id, lessonCount: 1,
      completedCount: displayedCompletedLessonCount(role, 1, 0),
    }));
    expect(getCurrentCourseLibraryModuleIndex(forRole("coach"))).toBe(-1);
    expect(canAccessCourseLibraryModuleByProgress(forRole("admin"), "newly-added")).toBe(true);
    expect(getCurrentCourseLibraryModuleIndex(forRole("student"))).toBe(0);
    expect(canAccessCourseLibraryModuleByProgress(forRole("student"), "newly-added")).toBe(false);
  });
});
