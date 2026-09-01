// @vitest-environment happy-dom
import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  role: "coach", rows: [] as unknown[], map: vi.fn(), select: vi.fn(), fetch: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => ({ id: "effective-viewer", role: mocks.role }) }));
vi.mock("@/lib/tag-feature-access", () => ({
  getCourseLibraryCourseAccess: async () => () => true,
  getCourseLibraryCourseAccessPolicy: async () => ({
    canAccessCourse: () => true,
    showLockedBlueprintRoadmap: false,
  }),
}));
vi.mock("@/lib/course-library-lesson-access", () => ({ canUserAccessCourseLibraryModule: async () => true }));
vi.mock("@/components/course-library/CourseLibraryGate", () => ({ CourseLibraryGate: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/course-library/CourseMap", () => ({ CourseMap: (props: unknown) => { mocks.map(props); return <div>Map</div>; } }));
vi.mock("@/lib/course-cover-image", () => ({ courseCoverImagePath: () => "/cover" }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));

import CourseLibraryStudentPage from "@/app/(dashboard)/dashboard/course-library/page";
import CourseLibraryCourseDetailPage from "@/app/(dashboard)/dashboard/course-library/[courseId]/page";
import CourseLibraryModulePage from "@/app/(dashboard)/dashboard/course-library/[courseId]/modules/[moduleId]/page";
import { CourseLibraryLessonControls } from "@/components/course-library/CourseLibraryLessonControls";

const course = { id: "course", title: "Foundations", summary: "", coverImageUrl: null };
const modules = [
  { id: "first", title: "Chapter 1", shortTitle: null, mapStyle: "lesson", weekLabel: null },
  { id: "last", title: "Final chapter", shortTitle: null, mapStyle: "lesson", weekLabel: null },
];
const lessons = [
  { id: "lesson-1", moduleId: "first", title: "Lesson 1", lessonType: "text" },
  { id: "lesson-2", moduleId: "last", title: "Lesson 2", lessonType: "text" },
];
const progress = [{ lessonId: "lesson-1", completedAt: new Date() }];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role = "coach";
  mocks.rows = [];
  mocks.select.mockImplementation(() => {
    const rows = mocks.rows.shift();
    const query: Record<string, unknown> = {};
    for (const method of ["from", "where", "leftJoin", "innerJoin", "orderBy", "limit", "groupBy"]) {
      query[method] = () => query;
    }
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve);
    return query;
  });
  vi.stubGlobal("fetch", mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({}) }));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});
afterEach(() => vi.unstubAllGlobals());

describe("staff course progress screens", () => {
  it.each(["admin", "coach"])("shows 100%% on course cards for %s with no completion records", async (role) => {
    mocks.role = role;
    mocks.rows = [[course], [{ courseId: "course", totalLessons: 2, completedLessons: 0 }]];
    const html = renderToStaticMarkup(await CourseLibraryStudentPage());
    expect(html).toContain("2 of 2 done");
    expect(html).toContain("100%");
    expect(html).toContain("Completed &amp; unlocked");
  });

  it("keeps student card percentages based on real records", async () => {
    mocks.role = "student";
    mocks.rows = [[course], [{ courseId: "course", totalLessons: 2, completedLessons: 1 }]];
    const html = renderToStaticMarkup(await CourseLibraryStudentPage());
    expect(html).toContain("1 of 2 done");
    expect(html).toContain("50%");
    expect(html).not.toContain("admin and coach access");
  });

  it.each(["admin", "coach"])("unlocks and completes the entire %s roadmap", async (role) => {
    mocks.role = role;
    mocks.rows = [[course], modules, lessons];
    const html = renderToStaticMarkup(await CourseLibraryCourseDetailPage({ params: Promise.resolve({ courseId: "course" }) }));
    expect(html).toContain("100%");
    expect(mocks.map).toHaveBeenCalledWith(expect.objectContaining({
      currentIndex: -1, staffProgress: true,
      stops: expect.arrayContaining(modules.map(({ id }) => expect.objectContaining({ id, completedCount: 1, isComplete: true }))),
    }));
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it("keeps the View As student roadmap incomplete", async () => {
    mocks.role = "student";
    mocks.rows = [[course], modules, lessons, progress, []];
    const html = renderToStaticMarkup(await CourseLibraryCourseDetailPage({ params: Promise.resolve({ courseId: "course" }) }));
    expect(html).toContain("50%");
    expect(mocks.map).toHaveBeenCalledWith(expect.objectContaining({ currentIndex: 1, staffProgress: false }));
    expect(html).not.toContain("admin and coach access");
  });

  it("marks only the student's explicitly granted stop as jump-unlocked", async () => {
    mocks.role = "student";
    mocks.rows = [[course], modules, lessons, [], [{ moduleId: "last" }]];
    renderToStaticMarkup(
      await CourseLibraryCourseDetailPage({
        params: Promise.resolve({ courseId: "course" }),
      }),
    );
    expect(mocks.map).toHaveBeenCalledWith(
      expect.objectContaining({
        currentIndex: 0,
        stops: expect.arrayContaining([
          expect.objectContaining({ id: "first", isJumpUnlocked: false }),
          expect.objectContaining({ id: "last", isJumpUnlocked: true }),
        ]),
      }),
    );
  });

  it.each(["admin", "coach"])("marks all chapter lessons Done for %s", async (role) => {
    mocks.role = role;
    mocks.rows = [[{ module: modules[0], courseTitle: "Foundations" }], lessons, [modules[1]]];
    const html = renderToStaticMarkup(await CourseLibraryModulePage({ params: Promise.resolve({ courseId: "course", moduleId: "first" }) }));
    expect(html.match(/>Done</g)).toHaveLength(2);
    expect(html).not.toContain(">Current<");
    expect(html).toContain("Next stop");
  });

  it("leaves student chapter lessons unfinished", async () => {
    mocks.role = "student";
    mocks.rows = [[{ module: modules[0], courseTitle: "Foundations" }], lessons, progress, [modules[1]]];
    const html = renderToStaticMarkup(await CourseLibraryModulePage({ params: Promise.resolve({ courseId: "course", moduleId: "first" }) }));
    expect(html.match(/>Done</g)).toHaveLength(1);
    expect(html).toContain(">Current<");
    expect(html).not.toContain("Next stop");
  });

  it("renders staff lesson controls as completed without an automatic progress write", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<CourseLibraryLessonControls lessonId="lesson" initialCompleted={false} completedByDefault nextHref="/next" />));
      expect(container.textContent).toContain("Completed — staff access");
      expect(container.textContent).toContain("Next lesson");
      expect(mocks.fetch).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("preserves normal student touch and completion controls", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<CourseLibraryLessonControls lessonId="lesson" initialCompleted={false} />));
      expect(container.textContent).toContain("Mark this lesson complete");
      expect(mocks.fetch).toHaveBeenCalledWith("/api/course-library/lessons/lesson/progress", expect.objectContaining({ body: JSON.stringify({ touch: true }) }));
    } finally {
      await act(async () => root.unmount());
    }
  });
});
