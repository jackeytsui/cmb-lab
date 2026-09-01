// @vitest-environment happy-dom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentCourseLibraryUnlock } from "@/components/admin/StudentCourseLibraryUnlock";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StudentCourseLibraryUnlock", () => {
  it("opens on the exact current lesson and previews later completions to reopen", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          courses: [
            {
              id: "course-1",
              title: "Intermediate",
              completedLessons: 3,
              totalLessons: 5,
              currentModuleId: "module-2",
              currentLessonId: "lesson-3",
              modules: [
                {
                  id: "module-1",
                  title: "Lesson 7",
                  shortTitle: null,
                  lessonCount: 2,
                  completedLessons: 2,
                  isComplete: true,
                  isCurrent: false,
                  lessons: [
                    {
                      id: "lesson-1",
                      title: "Challenge 7",
                      lessonType: "text_assignment",
                      isComplete: true,
                    },
                    {
                      id: "lesson-2",
                      title: "Vocal Hack 7",
                      lessonType: "vocal_hack",
                      isComplete: true,
                    },
                  ],
                },
                {
                  id: "module-2",
                  title: "Lesson 8",
                  shortTitle: null,
                  lessonCount: 3,
                  completedLessons: 1,
                  isComplete: false,
                  isCurrent: true,
                  lessons: [
                    {
                      id: "lesson-3",
                      title: "Vocal Hack 8",
                      lessonType: "vocal_hack",
                      isComplete: false,
                    },
                    {
                      id: "lesson-4",
                      title: "Listening 8",
                      lessonType: "listening_practice",
                      isComplete: true,
                    },
                    {
                      id: "lesson-5",
                      title: "Diary 8",
                      lessonType: "diary",
                      isComplete: false,
                    },
                  ],
                },
              ],
            },
          ],
        }),
      }),
    );

    render(
      <StudentCourseLibraryUnlock
        studentId="student-1"
        studentName="Katarina"
      />,
    );

    const lessonSelect = await screen.findByLabelText("Lesson to open next");

    expect((lessonSelect as HTMLSelectElement).value).toBe("lesson-3");
    expect(screen.getByText(/0 earlier lessons will be completed/)).toBeTruthy();
    expect(screen.getByText(/1 completed lesson will be reopened/)).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Set as next lesson" })).toBeTruthy();
    });
  });
});
