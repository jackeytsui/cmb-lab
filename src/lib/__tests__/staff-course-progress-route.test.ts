import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), access: vi.fn(), findProgress: vi.fn(), insert: vi.fn(), values: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/course-library-lesson-access", () => ({ canUserAccessCourseLibraryLesson: mocks.access }));
vi.mock("@/db", () => ({ db: {
  query: { courseLibraryLessonProgress: { findFirst: mocks.findProgress } },
  insert: mocks.insert,
} }));

import { GET, POST } from "@/app/api/course-library/lessons/[lessonId]/progress/route";

const context = { params: Promise.resolve({ lessonId: "lesson-1" }) };
function request(method = "GET", body?: unknown) {
  return new NextRequest("http://localhost/api/course-library/lessons/lesson-1/progress", {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue({ id: "viewer", role: "student" });
  mocks.access.mockResolvedValue(true);
  mocks.findProgress.mockResolvedValue(null);
  mocks.values.mockImplementation((row) => ({ onConflictDoUpdate: () => ({ returning: async () => [row] }) }));
  mocks.insert.mockReturnValue({ values: mocks.values });
});

describe("Course Library progress API staff override", () => {
  it.each(["admin", "coach"])("reports %s completion without fabricating a timestamp", async (role) => {
    mocks.user.mockResolvedValue({ id: "staff", role });
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      progress: null, completion: { isComplete: true }, completedByDefault: true,
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(["admin", "coach"])("never writes default completion or touches progress for %s", async (role) => {
    mocks.user.mockResolvedValue({ id: "staff", role });
    for (const body of [{ touch: true }, { completed: true }, { completed: false }]) {
      const response = await POST(request("POST", body), context);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ completion: { isComplete: true }, completedByDefault: true });
    }
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it.each(["student", "operations", "consultant", "temp"])("does not complete an unfinished %s account", async (role) => {
    mocks.user.mockResolvedValue({ id: "viewer", role });
    expect(await (await GET(request(), context)).json()).toMatchObject({
      progress: null, completion: { isComplete: false }, completedByDefault: false,
    });
  });

  it("uses the effective View As student's identity and still saves their real completion", async () => {
    mocks.user.mockResolvedValue({ id: "view-as-student", role: "student" });
    const response = await POST(request("POST", { completed: true }), context);
    expect(await response.json()).toMatchObject({ completion: { isComplete: true } });
    expect(mocks.access).toHaveBeenCalledWith({ id: "view-as-student", role: "student" }, "lesson-1");
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ userId: "view-as-student", completedAt: expect.any(Date) }));
  });

  it("keeps a student's lesson incomplete when only opened", async () => {
    const response = await POST(request("POST", { touch: true }), context);
    expect(await response.json()).toMatchObject({ completion: { isComplete: false } });
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ completedAt: null }));
  });

  it("preserves a student's already completed status", async () => {
    mocks.findProgress.mockResolvedValue({ completedAt: new Date() });
    expect(await (await GET(request(), context)).json()).toMatchObject({ completion: { isComplete: true }, completedByDefault: false });
  });

  it("denies unauthenticated requests before reading or writing progress", async () => {
    mocks.user.mockResolvedValue(null);
    expect((await GET(request(), context)).status).toBe(401);
    expect((await POST(request("POST", { completed: true }), context)).status).toBe(401);
    expect(mocks.findProgress).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not bypass missing/deleted course and lesson checks for staff", async () => {
    mocks.user.mockResolvedValue({ id: "staff", role: "admin" });
    mocks.access.mockResolvedValue(false);
    expect((await GET(request(), context)).status).toBe(404);
    expect((await POST(request("POST", { completed: true }), context)).status).toBe(404);
    expect(mocks.findProgress).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("still validates staff requests", async () => {
    mocks.user.mockResolvedValue({ id: "staff", role: "coach" });
    expect((await POST(request("POST", { completed: "true" }), context)).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
