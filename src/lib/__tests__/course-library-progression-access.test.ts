import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canAccessCourseLibraryModuleByProgress,
  getCurrentCourseLibraryModuleIndex,
  type CourseLibraryModuleProgress,
} from "@/lib/course-library-progression";
import {
  courseLibraryProgressLockedHref,
  hasCourseLibraryProgressLockedNotice,
} from "@/lib/course-library-navigation";

const modules: CourseLibraryModuleProgress[] = [
  { id: "chapter-1", lessonCount: 3, completedCount: 3 },
  { id: "chapter-2", lessonCount: 2, completedCount: 1 },
  { id: "chapter-3", lessonCount: 4, completedCount: 0 },
];

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("Course Library roadmap authorization", () => {
  it("keeps completed and current chapters accessible while locking later chapters", () => {
    expect(getCurrentCourseLibraryModuleIndex(modules)).toBe(1);
    expect(
      canAccessCourseLibraryModuleByProgress(modules, "chapter-1"),
    ).toBe(true);
    expect(
      canAccessCourseLibraryModuleByProgress(modules, "chapter-2"),
    ).toBe(true);
    expect(
      canAccessCourseLibraryModuleByProgress(modules, "chapter-3"),
    ).toBe(false);
  });

  it("unlocks the next chapter only after every lesson in the current chapter is complete", () => {
    const afterChapterTwo = modules.map((module) =>
      module.id === "chapter-2"
        ? { ...module, completedCount: module.lessonCount }
        : module,
    );

    expect(getCurrentCourseLibraryModuleIndex(afterChapterTwo)).toBe(2);
    expect(
      canAccessCourseLibraryModuleByProgress(afterChapterTwo, "chapter-3"),
    ).toBe(true);
  });

  it("allows every chapter after the course is complete", () => {
    const complete = modules.map((module) => ({
      ...module,
      completedCount: module.lessonCount,
    }));

    expect(getCurrentCourseLibraryModuleIndex(complete)).toBe(-1);
    expect(
      canAccessCourseLibraryModuleByProgress(complete, "chapter-3"),
    ).toBe(true);
  });

  it("matches roadmap behavior for empty chapters and rejects unknown chapters", () => {
    const withEmpty = [
      { id: "intro", lessonCount: 0, completedCount: 0 },
      ...modules,
      { id: "coming-soon", lessonCount: 0, completedCount: 0 },
    ];

    expect(
      canAccessCourseLibraryModuleByProgress(withEmpty, "intro"),
    ).toBe(true);
    expect(
      canAccessCourseLibraryModuleByProgress(withEmpty, "coming-soon"),
    ).toBe(false);
    expect(
      canAccessCourseLibraryModuleByProgress(withEmpty, "missing"),
    ).toBe(false);
  });

  it("guards pages and every lesson content, media, and mutation route", () => {
    const coursePage = source(
      "src/app/(dashboard)/dashboard/course-library/[courseId]/page.tsx",
    );
    const modulePage = source(
      "src/app/(dashboard)/dashboard/course-library/[courseId]/modules/[moduleId]/page.tsx",
    );
    const lessonPage = source(
      "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/page.tsx",
    );
    expect(coursePage).toContain("getCourseLibraryCourseAccess");
    expect(coursePage).toContain("if (!canSeeCourse(course.id)) notFound()");
    expect(modulePage).toContain("canUserAccessCourseLibraryModule");
    expect(lessonPage).toContain("canUserAccessCourseLibraryLesson");
    expect(modulePage).toContain("if (!row) notFound()");
    expect(lessonPage).toContain("if (!row) notFound()");
    expect(modulePage).toContain("if (!canSeeCourse(courseId)) notFound()");
    expect(lessonPage).toContain("if (!canSeeCourse(courseId)) notFound()");
    expect(modulePage).toContain(
      "redirect(courseLibraryProgressLockedHref(courseId))",
    );
    expect(lessonPage).toContain(
      "redirect(courseLibraryProgressLockedHref(courseId))",
    );
    expect(modulePage).toContain("if (!currentUser) notFound()");
    expect(lessonPage).toContain("if (!currentUser) notFound()");
    expect(coursePage).toContain("That lesson is not unlocked yet.");

    const guardedLessonRoutes = [
      "src/app/api/course-library/audio/[lessonId]/route.ts",
      "src/app/api/course-library/download/[lessonId]/route.ts",
      "src/app/api/course-library/image/[lessonId]/route.ts",
      "src/app/api/course-library/stream/[lessonId]/route.ts",
      "src/app/api/course-library/listening-audio/[lessonId]/route.ts",
      "src/app/api/course-library/vocal-hack-video/[lessonId]/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/assignment-submission/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/diary-submission/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/grade-quiz/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/listening-check/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/notes/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/progress/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/vocal-hack-submission/route.ts",
    ];

    for (const route of guardedLessonRoutes) {
      expect(source(route), route).toContain(
        "canUserAccessCourseLibraryLesson",
      );
    }
  });

  it("builds and recognizes the locked-progress roadmap notice", () => {
    expect(courseLibraryProgressLockedHref("course/with spaces")).toBe(
      "/course-library/course%2Fwith%20spaces?notice=progress-locked",
    );
    expect(hasCourseLibraryProgressLockedNotice("progress-locked")).toBe(
      true,
    );
    expect(
      hasCourseLibraryProgressLockedNotice(["ignored", "progress-locked"]),
    ).toBe(true);
    expect(hasCourseLibraryProgressLockedNotice("ignored")).toBe(false);
    expect(hasCourseLibraryProgressLockedNotice(undefined)).toBe(false);
  });

  it("uses the View As student identity for progress and interactive media", () => {
    const viewAsAwareRoutes = [
      "src/app/api/course-library/lessons/[lessonId]/progress/route.ts",
      "src/app/api/course-library/lessons/[lessonId]/listening-check/route.ts",
      "src/app/api/course-library/listening-audio/[lessonId]/route.ts",
      "src/app/api/course-library/vocal-hack-video/[lessonId]/route.ts",
    ];

    for (const route of viewAsAwareRoutes) {
      expect(source(route), route).toContain("getCurrentUser");
      expect(source(route), route).not.toContain(
        'from "@clerk/nextjs/server"',
      );
    }
  });
});
