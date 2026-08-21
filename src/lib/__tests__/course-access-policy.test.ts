import { describe, expect, it } from "vitest";
import { canAccessLessonByPolicy } from "@/lib/course-access-policy";

const base = {
  accessTier: null,
  hasCourseLevelAccess: false,
  hasModuleGrant: false,
  hasLessonGrant: false,
  lessonIndex: 0,
  previewLessonCount: 3,
} as const;

describe("canAccessLessonByPolicy", () => {
  it("allows every lesson for a full course grant", () => {
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "full",
        hasCourseLevelAccess: true,
        lessonIndex: 99,
      }),
    ).toBe(true);
  });

  it("limits preview course grants to the configured leading lessons", () => {
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "preview",
        hasCourseLevelAccess: true,
        lessonIndex: 2,
      }),
    ).toBe(true);
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "preview",
        hasCourseLevelAccess: true,
        lessonIndex: 3,
      }),
    ).toBe(false);
  });

  it("does not turn a child grant into full-course access", () => {
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "full",
        lessonIndex: 4,
      }),
    ).toBe(false);
  });

  it("allows explicit module and lesson grants independently", () => {
    expect(
      canAccessLessonByPolicy({ ...base, hasModuleGrant: true, lessonIndex: 8 }),
    ).toBe(true);
    expect(
      canAccessLessonByPolicy({ ...base, hasLessonGrant: true, lessonIndex: 8 }),
    ).toBe(true);
  });

  it("treats zero and negative preview limits as no preview lessons", () => {
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "preview",
        hasCourseLevelAccess: true,
        previewLessonCount: 0,
      }),
    ).toBe(false);
    expect(
      canAccessLessonByPolicy({
        ...base,
        accessTier: "preview",
        hasCourseLevelAccess: true,
        previewLessonCount: -2,
      }),
    ).toBe(false);
  });
});
