import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "a15d2d2d-428d-41c3-adf7-adbfc965ec75";
const MODULE_ID = "d2a44fbb-e4aa-48a9-8d22-e05f78056762";
const COURSE_ID = "a3a5a4bf-d8b3-47f1-a101-dbbec725cda0";

const mocks = vi.hoisted(() => ({
  currentUser: null as null | {
    id: string;
    email: string;
    role: "student";
  },
  targetRows: [] as unknown[],
  canSeeCourse: true,
  canAccessModule: false,
  select: vi.fn(),
  neonSql: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => mocks.currentUser,
}));
vi.mock("@/lib/course-library-access", () => ({
  visibleCourseStatuses: () => ["published"],
}));
vi.mock("@/lib/tag-feature-access", () => ({
  getCourseLibraryCourseAccess: async () => () => mocks.canSeeCourse,
}));
vi.mock("@/lib/course-library-lesson-access", () => ({
  canUserAccessCourseLibraryModule: async () => mocks.canAccessModule,
}));
vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));
vi.mock("@/db", () => ({
  db: { select: mocks.select },
  getNeonSql: () => mocks.neonSql,
}));

import { jumpAheadToCourseLibraryModule } from "@/app/(dashboard)/dashboard/course-library/actions";

function queryFor(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "where", "limit"]) {
    query[method] = () => query;
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentUser = { id: USER_ID, email: "student@example.com", role: "student" };
  mocks.targetRows = [
    {
      moduleId: MODULE_ID,
      moduleTitle: "Week 4",
      courseId: COURSE_ID,
      courseTitle: "Foundations",
    },
  ];
  mocks.canSeeCourse = true;
  mocks.canAccessModule = false;
  mocks.select.mockImplementation(() => queryFor(mocks.targetRows));
  mocks.neonSql.mockResolvedValue([]);
});

describe("student Course Library jump action", () => {
  it("rejects malformed input before authentication or database work", async () => {
    expect(await jumpAheadToCourseLibraryModule("not-a-module")).toEqual({
      success: false,
      error: "That course stop is not available.",
    });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("requires an authenticated effective student", async () => {
    mocks.currentUser = null;
    expect(await jumpAheadToCourseLibraryModule(MODULE_ID)).toEqual({
      success: false,
      error: "Please sign in again to continue.",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("does not grant a module outside the student's course entitlement", async () => {
    mocks.canSeeCourse = false;
    expect(await jumpAheadToCourseLibraryModule(MODULE_ID)).toEqual({
      success: false,
      error: "You do not have access to that course.",
    });
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("navigates without writing when progression already allows the stop", async () => {
    mocks.canAccessModule = true;
    expect(await jumpAheadToCourseLibraryModule(MODULE_ID)).toEqual({
      success: true,
      href: `/course-library/${COURSE_ID}/modules/${MODULE_ID}`,
    });
    expect(mocks.neonSql).not.toHaveBeenCalled();
  });

  it("atomically grants only the selected stop and records an audit event", async () => {
    expect(await jumpAheadToCourseLibraryModule(MODULE_ID)).toEqual({
      success: true,
      href: `/course-library/${COURSE_ID}/modules/${MODULE_ID}`,
    });
    expect(mocks.neonSql).toHaveBeenCalledTimes(1);

    const [strings, ...values] = mocks.neonSql.mock.calls[0];
    const statement = Array.from(strings as TemplateStringsArray).join("?");
    expect(statement).toContain("INSERT INTO course_library_module_jump_grants");
    expect(statement).toContain("ON CONFLICT (user_id, module_id) DO NOTHING");
    expect(statement).toContain("INSERT INTO sync_events");
    expect(statement).not.toContain("course_library_lesson_progress");
    expect(values).toContain(USER_ID);
    expect(values).toContain(MODULE_ID);
    expect(values).toEqual(
      expect.arrayContaining([
        expect.stringContaining('"preservesLessonCompletion":true'),
      ]),
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      `/course-library/${COURSE_ID}`,
    );
  });
});
