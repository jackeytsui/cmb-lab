import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "a15d2d2d-428d-41c3-adf7-adbfc965ec75";
const COURSE_ID = "a3a5a4bf-d8b3-47f1-a101-dbbec725cda0";
const LESSON_1 = "f0af3007-f2a7-44f8-a424-0f5ac3438ff0";
const LESSON_2 = "0dcf365c-10b0-4bb6-88f5-d700988c9f25";
const LESSON_3 = "02790dee-f595-40de-a301-1990eed161fb";

const mocks = vi.hoisted(() => ({
  currentUser: null as null | { id: string; email: string; role: string },
  realUser: null as null | { id: string; email: string; role: string },
  loadProgress: vi.fn(),
  neonSql: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mocks.currentUser,
  getRealUser: async () => mocks.realUser,
}));
vi.mock("@/lib/course-library-student-progress", () => ({
  loadStudentCourseLibraryProgress: mocks.loadProgress,
}));
vi.mock("@/db", () => ({
  getNeonSql: () => mocks.neonSql,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import {
  dismissCourseLibraryProgressRestore,
  restoreCourseLibraryProgressOnce,
} from "@/app/(dashboard)/dashboard/course-library/progress-restore-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = {
    id: USER_ID,
    email: "student@example.com",
    role: "student",
  };
  mocks.realUser = { ...mocks.currentUser };
  mocks.loadProgress.mockResolvedValue([
    {
      id: COURSE_ID,
      title: "Foundations",
      hasAccess: true,
      modules: [
        {
          id: "module-1",
          title: "Week 1",
          shortTitle: null,
          lessonIds: [LESSON_1, LESSON_2, LESSON_3],
          completedLessonIds: [LESSON_1],
          lessons: [],
        },
      ],
    },
  ]);
  mocks.neonSql.mockResolvedValue([{ entity_id: USER_ID }]);
});

describe("one-time Course Library progress restore actions", () => {
  it("atomically claims one use and only fills missing earlier completions", async () => {
    expect(
      await restoreCourseLibraryProgressOnce([
        { courseId: COURSE_ID, target: LESSON_3 },
      ]),
    ).toEqual({ success: true, lessonsCompleted: 1 });

    expect(mocks.neonSql).toHaveBeenCalledTimes(1);
    const [strings, ...values] = mocks.neonSql.mock.calls[0];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(statement).toContain("WITH claimed AS");
    expect(statement).toContain(
      "INSERT INTO course_library_progress_restore_decisions",
    );
    expect(statement).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(statement).toContain("INSERT INTO course_library_lesson_progress");
    expect(statement).toContain("completed_at = COALESCE");
    expect(statement).not.toContain("completed_at = NULL");
    expect(statement).not.toContain("DELETE FROM");
    expect(values).toContain(USER_ID);
    expect(values).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`\"lesson_id\":\"${LESSON_2}\"`),
        expect.stringContaining("student_one_time_progress_restore"),
      ]),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/course-library",
    );
  });

  it("blocks staff impersonation and never loads or writes student data", async () => {
    mocks.realUser = {
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
    };

    expect(
      await restoreCourseLibraryProgressOnce([
        { courseId: COURSE_ID, target: LESSON_3 },
      ]),
    ).toEqual({
      success: false,
      error: "Only a signed-in student can restore their own progress.",
    });
    expect(mocks.loadProgress).not.toHaveBeenCalled();
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("does not write when a selection is outside existing entitlements", async () => {
    const result = await restoreCourseLibraryProgressOnce([
      {
        courseId: "84fa5ac3-7980-43af-aabe-0371f36aef44",
        target: LESSON_3,
      },
    ]);

    expect(result.success).toBe(false);
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("reports a replay when the unique claim was not acquired", async () => {
    mocks.neonSql.mockResolvedValue([]);
    expect(
      await restoreCourseLibraryProgressOnce([
        { courseId: COURSE_ID, target: LESSON_3 },
      ]),
    ).toEqual({
      success: false,
      error:
        "This one-time progress choice has already been used or dismissed.",
    });
  });

  it("does not consume the one-time choice for a no-op selection", async () => {
    expect(
      await restoreCourseLibraryProgressOnce([
        { courseId: COURSE_ID, target: LESSON_2 },
      ]),
    ).toEqual({
      success: false,
      error:
        "Those choices do not move your progress forward. Choose a later lesson or keep your current progress.",
    });
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("persists a permanent dismissal without touching progress", async () => {
    expect(await dismissCourseLibraryProgressRestore()).toEqual({
      success: true,
      lessonsCompleted: 0,
    });
    const [strings] = mocks.neonSql.mock.calls[0];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(statement).toContain("'dismissed'");
    expect(statement).not.toContain("course_library_lesson_progress");
  });
});
