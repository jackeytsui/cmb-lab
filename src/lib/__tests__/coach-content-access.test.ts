import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canManageCourseContent, PLATFORM_ROLES } from "@/lib/platform-roles";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
  findUser: vi.fn(),
  cookies: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  returning: vi.fn(),
  permissions: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/db", () => ({
  db: { query: { users: { findFirst: mocks.findUser } }, update: mocks.update },
}));
vi.mock("@/lib/permissions", () => ({ resolvePermissions: mocks.permissions }));
vi.mock("@/lib/tag-feature-access", () => ({
  getUserFeatureTagOverrides: vi.fn(), hasFeatureWithTagOverrides: vi.fn(),
}));

import { hasCourseContentAccess } from "@/lib/auth";
import { PUT } from "@/app/api/admin/course-library/lessons/[lessonId]/route";
import {
  getAnyAssignmentReviewer, getReviewableAssignmentTypes, userCanReviewAssignments,
} from "@/lib/assignment-review";

const LESSON_ID = "251e18b7-caad-48b0-8dcd-7446203b012a";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ userId: "clerk-coach", sessionClaims: { metadata: { role: "admin" } } });
  mocks.findUser.mockResolvedValue({ id: "coach-id", role: "coach", deletedAt: null });
  mocks.returning.mockResolvedValue([{ id: LESSON_ID, title: "Updated lesson" }]);
  mocks.set.mockReturnValue({ where: vi.fn(() => ({ returning: mocks.returning })) });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.permissions.mockResolvedValue({ canUseFeature: () => false });
});

describe("coach content authorization", () => {
  it("adds content management only to Coach and Admin, not peer staff or students", () => {
    expect(PLATFORM_ROLES.filter(canManageCourseContent)).toEqual(["coach", "admin"]);
    expect(canManageCourseContent(undefined)).toBe(false);
  });

  it("uses the real database role without consulting View As", async () => {
    expect(await hasCourseContentAccess()).toBe(true);
    expect(mocks.cookies).not.toHaveBeenCalled();
  });

  it.each(["coach", "admin"])("allows %s to save lesson content", async (role) => {
    mocks.findUser.mockResolvedValue({ role, deletedAt: null });
    const response = await PUT(new NextRequest("http://localhost/api/admin/course-library/lessons/" + LESSON_ID, {
      method: "PUT", body: JSON.stringify({ title: "Updated lesson", content: { text: "Course content" } }),
    }), { params: Promise.resolve({ lessonId: LESSON_ID }) });
    expect(response.status).toBe(200);
    expect(mocks.set).toHaveBeenCalledWith({ title: "Updated lesson", content: { text: "Course content" } });
  });

  it.each(["student", "consultant", "temp", "operations"])("denies %s despite stale admin claims", async (role) => {
    mocks.findUser.mockResolvedValue({ role, deletedAt: null });
    const response = await PUT(new NextRequest("http://localhost/api/admin/course-library/lessons/" + LESSON_ID, {
      method: "PUT", body: JSON.stringify({ title: "Not allowed" }),
    }), { params: Promise.resolve({ lessonId: LESSON_ID }) });
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("denies a deleted coach", async () => {
    mocks.findUser.mockResolvedValue({ role: "coach", deletedAt: new Date() });
    expect(await hasCourseContentAccess()).toBe(false);
  });

  it("denies an unauthenticated request", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    mocks.currentUser.mockResolvedValue(null);
    expect(await hasCourseContentAccess()).toBe(false);
  });
});

describe("coach assignment submission access", () => {
  it("allows coaches to access every existing assignment type without another role bundle", async () => {
    const coach = { id: "coach-id", role: "coach" };
    expect(await getAnyAssignmentReviewer()).toMatchObject(coach);
    expect(await getReviewableAssignmentTypes(coach)).toEqual(["text_assignment", "vocal_hack", "diary"]);
    for (const type of ["text_assignment", "vocal_hack", "diary"] as const) {
      expect(await userCanReviewAssignments(coach, type)).toBe(true);
    }
    expect(mocks.permissions).not.toHaveBeenCalled();
  });

  it("keeps non-coach reviewers restricted to their granted assignment types", async () => {
    mocks.permissions.mockResolvedValue({ canUseFeature: (key: string) => key === "assignment_review_vocal" });
    const reviewer = { id: "reviewer-id", role: "student" };
    expect(await getReviewableAssignmentTypes(reviewer)).toEqual(["vocal_hack"]);
    expect(await userCanReviewAssignments(reviewer, "text_assignment")).toBe(false);
  });
});

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(filename) : /\.(ts|tsx)$/.test(filename) ? [filename] : [];
  });
}

describe("content access coverage", () => {
  it("does not leave admin-only editor or upload gates in Course Library or legacy courses", () => {
    const directories = ["src/app/api/admin/course-library", "src/app/(dashboard)/admin/course-library",
      "src/app/api/admin/courses", "src/app/api/admin/modules", "src/app/api/admin/lessons",
      "src/app/api/admin/interactions", "src/app/api/admin/attachments"];
    for (const file of directories.flatMap(sources).filter((file) => !file.includes("/progress-migration/"))) {
      expect(readFileSync(file, "utf8"), file).not.toContain('hasMinimumRole("admin")');
    }
  });

  it("retains the admin-only progress migration gate", () => {
    expect(readFileSync("src/app/api/admin/course-library/progress-migration/route.ts", "utf8"))
      .toContain('hasMinimumRole("admin")');
  });
});
