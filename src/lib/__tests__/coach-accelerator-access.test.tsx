import React from "react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/feature-definitions";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), permissions: vi.fn(), overrides: vi.fn(), applyOverrides: vi.fn(),
  select: vi.fn(), insert: vi.fn(), delete: vi.fn(), execute: vi.fn(), management: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.user, hasAcceleratorManagementAccess: mocks.management,
}));
vi.mock("@/lib/permissions", () => ({ resolvePermissions: mocks.permissions }));
vi.mock("@/lib/tag-feature-access", () => ({
  getUserFeatureTagOverrides: mocks.overrides, hasFeatureWithTagOverrides: mocks.applyOverrides,
  getRestrictedContentIds: vi.fn(), getUserContentGrants: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {
  select: mocks.select, insert: mocks.insert, delete: mocks.delete, execute: mocks.execute,
} }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`Redirect: ${url}`); } }));

import { userCanUseFeature } from "@/lib/feature-access";
import { userCanAccessAudioCourse } from "@/lib/audio-course-access";
import { FeatureGate } from "@/components/auth/FeatureGate";
import AcceleratorAdminLayout from "@/app/(dashboard)/admin/accelerator/layout";
import AcceleratorExtraAdminLayout from "@/app/(dashboard)/admin/accelerator-extra/layout";
import * as completion from "@/app/api/accelerator/content-completion/route";
import * as typing from "@/app/api/accelerator/typing/progress/route";
import * as reader from "@/app/api/accelerator/reader/progress/route";
import * as scripts from "@/app/api/accelerator/scripts/progress/route";
import * as toneProgress from "@/app/api/accelerator-extra/tone-mastery/progress/route";
import { GET as settings } from "@/app/api/accelerator/settings/route";
import { GET as toneClips } from "@/app/api/accelerator-extra/tone-mastery/route";

const EXCLUDED: FeatureKey[] = ["mandarin_accelerator", "audio_accelerator_edition", "tone_mastery", "listening_training"];
const coach = { id: "coach-id", role: "coach" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.user.mockResolvedValue(coach);
  mocks.permissions.mockResolvedValue({ canUseFeature: () => true });
  mocks.overrides.mockResolvedValue({ allow: new Set(EXCLUDED), deny: new Set() });
  mocks.applyOverrides.mockReturnValue(true);
  mocks.management.mockResolvedValue(false);
});

describe("coach Accelerator exclusions", () => {
  it("fails closed when a caller omits the required persisted role", async () => {
    // @ts-expect-error Deliberately exercise a malformed runtime caller.
    expect(await userCanUseFeature({ id: "coach-id" }, "mandarin_accelerator")).toBe(false);
    expect(mocks.overrides).not.toHaveBeenCalled();
  });

  it.each(EXCLUDED)("denies %s before full-access, package, or tag grants", async (feature) => {
    expect(await userCanUseFeature(coach, feature)).toBe(false);
    expect(mocks.permissions).not.toHaveBeenCalled();
    expect(mocks.overrides).not.toHaveBeenCalled();
  });

  it("keeps every other coach feature and all admin features available", async () => {
    for (const feature of FEATURE_KEYS) {
      expect(await userCanUseFeature(coach, feature)).toBe(!EXCLUDED.includes(feature));
      expect(await userCanUseFeature({ id: "admin-id", role: "admin" }, feature)).toBe(true);
    }
  });

  it.each(EXCLUDED)("preserves student entitlement evaluation for %s", async (feature) => {
    const student = { id: "student-id", role: "student" };
    expect(await userCanUseFeature(student, feature)).toBe(true);
    expect(mocks.permissions).toHaveBeenCalledWith(student.id);
    mocks.applyOverrides.mockReturnValue(false);
    expect(await userCanUseFeature(student, feature)).toBe(false);
  });

  it("denies Extra Pack audio even through podcast access while keeping standard audio", async () => {
    const course = { id: "course-id", title: "Audio", description: JSON.stringify({ audioCourse: true, extraPack: true }) };
    expect(await userCanAccessAudioCourse(coach, course)).toBe(false);
    expect(await userCanAccessAudioCourse({ id: "admin-id", role: "admin" }, course)).toBe(true);
    expect(await userCanAccessAudioCourse(coach, { ...course, description: JSON.stringify({ audioCourse: true }) })).toBe(true);
  });

  it.each(EXCLUDED)("redirects coach direct links for %s back to Course Library", async (feature) => {
    await expect(FeatureGate({ feature, children: <p>Accelerator content</p> }))
      .rejects.toThrow("Redirect: /dashboard/course-library");
  });

  it("renders permitted content normally", async () => {
    const children = <p>Course Library</p>;
    expect((await FeatureGate({ feature: "course_library", children }))?.props.children).toBe(children);
  });

  it.each([AcceleratorAdminLayout, AcceleratorExtraAdminLayout])("protects Accelerator admin page families", async (layout) => {
    await expect(layout({ children: "content" })).rejects.toThrow("Redirect: /admin/manage");
    mocks.management.mockResolvedValue(true);
    expect(await layout({ children: "content" })).toBe("content");
  });
});

const handlers = [
  ["completion GET", completion.GET], ["completion POST", completion.POST], ["completion DELETE", completion.DELETE],
  ["typing GET", typing.GET], ["typing POST", typing.POST], ["typing DELETE", typing.DELETE],
  ["reader GET", reader.GET], ["reader POST", reader.POST],
  ["scripts GET", scripts.GET], ["scripts POST", scripts.POST],
  ["tone POST", toneProgress.POST], ["tone DELETE", toneProgress.DELETE],
  ["settings GET", settings], ["tone clips GET", toneClips],
] as const;

describe("Accelerator API guards", () => {
  it.each(handlers)("denies coach %s before data reads or writes", async (_name, handler) => {
    const response = await handler(new NextRequest("https://example.test/api/test"));
    expect(response.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(handlers)("keeps unauthenticated %s requests rejected", async (_name, handler) => {
    mocks.user.mockResolvedValue(null);
    expect((await handler(new NextRequest("https://example.test/api/test"))).status).toBe(401);
  });

  it.each(["student", "admin"])("allows entitled %s settings reads", async (role) => {
    mocks.user.mockResolvedValue({ id: `${role}-id`, role });
    mocks.execute.mockResolvedValue({ rows: [] });
    expect((await settings()).status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});

function routes(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? routes(file) : entry.name === "route.ts" ? [file] : [];
  });
}

describe("Accelerator guard coverage", () => {
  it("gates all learner APIs", () => {
    for (const file of [...routes("src/app/api/accelerator"), ...routes("src/app/api/accelerator-extra")]) {
      expect(readFileSync(file, "utf8"), file).toContain("userCanUseFeature(");
    }
  });

  it("does not retain broad coach grants in dedicated Accelerator admin APIs", () => {
    for (const file of [...routes("src/app/api/admin/accelerator"), ...routes("src/app/api/admin/accelerator-extra")]) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toContain('hasMinimumRole("coach")');
      expect(source, file).not.toContain("hasCourseContentAccess");
      expect(source, file).toMatch(/hasAcceleratorManagementAccess\(|hasMinimumRole\("admin"\)/);
    }
  });
});
