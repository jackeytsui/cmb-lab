import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_KEYS } from "@/lib/feature-definitions";
import { filterFeaturesForRole } from "@/lib/platform-roles";

const mocks = vi.hoisted(() => ({ user: vi.fn(), select: vi.fn(), where: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { query: { users: { findFirst: mocks.user } }, select: mocks.select } }));

import { resolvePermissions } from "@/lib/permissions";

beforeEach(() => {
  vi.resetAllMocks();
  const query = { where: mocks.where, innerJoin: () => query };
  mocks.select.mockReturnValue({ from: () => query });
  mocks.where
    .mockResolvedValueOnce([{ roleId: "all-features-bundle", allCourses: true }])
    .mockResolvedValueOnce(FEATURE_KEYS.map((featureKey) => ({ featureKey })))
    .mockResolvedValueOnce([]);
});

describe("resolved role permissions", () => {
  it.each(["coach", "admin"])("applies %s policy after merging package feature grants", async (role) => {
    mocks.user.mockResolvedValue({ role });
    const permissions = await resolvePermissions(`${role}-id`);
    expect([...permissions.features]).toEqual(filterFeaturesForRole(role, FEATURE_KEYS));
    expect(permissions.canUseFeature("mandarin_accelerator")).toBe(role === "admin");
    expect(permissions.canUseFeature("course_library")).toBe(true);
    expect(permissions.canAccessCourse("any-course")).toBe(true);
  });
});
