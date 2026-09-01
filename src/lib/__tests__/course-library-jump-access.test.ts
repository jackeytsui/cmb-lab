import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rows: [] as unknown[],
  select: vi.fn(),
  canSeeCourse: true,
  fullAccess: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/course-library-access", () => ({
  visibleCourseStatuses: () => ["published"],
}));
vi.mock("@/lib/tag-feature-access", () => ({
  getCourseLibraryCourseAccess: async () => () => mocks.canSeeCourse,
}));
vi.mock("@/lib/platform-roles", () => ({
  PLATFORM_ROLES: ["student", "coach", "admin"],
  hasFullFeatureAccess: () => mocks.fullAccess,
}));

import { canUserAccessCourseLibraryModule } from "@/lib/course-library-lesson-access";

function queryFor(rows: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of [
    "from",
    "innerJoin",
    "leftJoin",
    "where",
    "limit",
    "groupBy",
    "orderBy",
  ]) {
    query[method] = () => query;
  }
  query.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = [];
  mocks.canSeeCourse = true;
  mocks.fullAccess = false;
  mocks.select.mockImplementation(() => queryFor(mocks.rows.shift()));
});

describe("Course Library jump-grant authorization", () => {
  it("allows the one explicitly granted module before evaluating progression", async () => {
    mocks.rows = [
      [{ courseId: "course", moduleId: "later" }],
      [{ id: "grant" }],
    ];

    await expect(
      canUserAccessCourseLibraryModule(
        { id: "student", role: "student" },
        "later",
      ),
    ).resolves.toBe(true);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("keeps an ungranted future module behind normal progression", async () => {
    mocks.rows = [
      [{ courseId: "course", moduleId: "later" }],
      [],
      [
        { id: "current", lessonCount: 1, completedCount: 0 },
        { id: "later", lessonCount: 1, completedCount: 0 },
      ],
    ];

    await expect(
      canUserAccessCourseLibraryModule(
        { id: "student", role: "student" },
        "later",
      ),
    ).resolves.toBe(false);
    expect(mocks.select).toHaveBeenCalledTimes(3);
  });

  it("never lets a jump bypass course entitlement", async () => {
    mocks.canSeeCourse = false;
    mocks.rows = [[{ courseId: "course", moduleId: "later" }]];

    await expect(
      canUserAccessCourseLibraryModule(
        { id: "student", role: "student" },
        "later",
      ),
    ).resolves.toBe(false);
    expect(mocks.select).toHaveBeenCalledTimes(1);
  });
});
