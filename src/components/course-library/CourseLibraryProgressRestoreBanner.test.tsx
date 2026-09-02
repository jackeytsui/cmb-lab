// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseLibraryProgressRestoreBanner } from "@/components/course-library/CourseLibraryProgressRestoreBanner";

const COURSE_ID = "a3a5a4bf-d8b3-47f1-a101-dbbec725cda0";
const INTERMEDIATE_ID = "84fa5ac3-7980-43af-aabe-0371f36aef44";
const LESSON_ID = "02790dee-f595-40de-a301-1990eed161fb";

const mocks = vi.hoisted(() => ({
  restore: vi.fn(),
  dismiss: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock(
  "@/app/(dashboard)/dashboard/course-library/progress-restore-actions",
  () => ({
    restoreCourseLibraryProgressOnce: mocks.restore,
    dismissCourseLibraryProgressRestore: mocks.dismiss,
  }),
);
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));

const courses = [
  {
    id: COURSE_ID,
    title: "Foundations",
    currentlyLocked: false,
    completedLessons: 2,
    totalLessons: 10,
    modules: [
      {
        id: "module-1",
        title: "Week 4",
        shortTitle: null,
        lessons: [{ id: LESSON_ID, title: "Grocery Store Shopping" }],
      },
    ],
  },
  {
    id: INTERMEDIATE_ID,
    title: "Intermediate",
    currentlyLocked: true,
    completedLessons: 0,
    totalLessons: 8,
    modules: [
      {
        id: "intermediate-module",
        title: "Intermediate introduction",
        shortTitle: null,
        lessons: [{ id: "intermediate-lesson", title: "Welcome" }],
      },
    ],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restore.mockResolvedValue({
    success: true,
    lessonsCompleted: 7,
    coursesUnlocked: 0,
  });
  mocks.dismiss.mockResolvedValue({
    success: true,
    lessonsCompleted: 0,
    coursesUnlocked: 0,
  });
});

afterEach(() => vi.restoreAllMocks());

describe("CourseLibraryProgressRestoreBanner", () => {
  it("explains the one-time limit and submits only explicit course choices", async () => {
    render(<CourseLibraryProgressRestoreBanner courses={courses} />);

    fireEvent.click(screen.getByRole("button", { name: "Unlock the Courses" }));
    expect(screen.getByText(/This is available once/)).toBeTruthy();
    expect(
      screen.getByText(/Foundations, Intermediate, or Advanced/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Intermediate")).toBeTruthy();
    expect(screen.getByText("Unlocks when confirmed")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Foundations"), {
      target: { value: LESSON_ID },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Use my one-time restore" }),
    );

    await waitFor(() => {
      expect(mocks.restore).toHaveBeenCalledWith([
        { courseId: COURSE_ID, target: LESSON_ID },
      ]);
      expect(mocks.refresh).toHaveBeenCalled();
    });
  });

  it("requires confirmation before permanently dismissing the offer", async () => {
    render(<CourseLibraryProgressRestoreBanner courses={courses} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Permanently dismiss progress restoration",
      }),
    );
    expect(screen.getByText("Dismiss this permanently?")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss permanently" }),
    );

    await waitFor(() => {
      expect(mocks.dismiss).toHaveBeenCalledTimes(1);
      expect(mocks.restore).not.toHaveBeenCalled();
    });
  });
});
