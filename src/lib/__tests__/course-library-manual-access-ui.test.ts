import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  "src/app/(dashboard)/admin/course-library/[courseId]/CourseLibraryEditorClient.tsx",
  "utf8",
);
const tagManager = readFileSync(
  "src/app/(dashboard)/admin/tag-access/TagAccessClient.tsx",
  "utf8",
);
const courseUpdateRoute = readFileSync(
  "src/app/api/admin/course-library/courses/[courseId]/route.ts",
  "utf8",
);

describe("Course Library manual access editor", () => {
  it("keeps large student exception sets collapsed and scroll-bounded", () => {
    expect(editor).toContain("showManualExceptions");
    expect(editor).toContain('aria-controls="manual-course-access-list"');
    expect(editor).toContain("manual access exception");
    expect(editor).toContain("max-h-64");
    expect(editor).toContain("overflow-y-auto");
  });

  it("shows names and emails without exposing raw user IDs", () => {
    expect(editor).toContain('student?.name || "Unknown student"');
    expect(editor).toContain("{student.email}");
    expect(editor).not.toContain("{uid}</");
  });

  it("explains that custom courses stay private when published", () => {
    expect(editor).toContain("isPrivateCourseLibraryCourseTitle");
    expect(editor).toContain("Private custom course");
    expect(editor).toContain(
      "Publishing this course will not make it visible to everyone.",
    );
    expect(editor).toContain("Assign a student by email");
  });

  it("keeps private courses out of tag-based course assignment", () => {
    expect(tagManager).toContain("isPrivateCourseLibraryCourseTitle");
    expect(tagManager).toContain(
      "!isPrivateCourseLibraryCourseTitle(c.title)",
    );
  });

  it("clears tag grants when a course becomes private", () => {
    expect(courseUpdateRoute).toContain(
      "isPrivateCourseLibraryCourseTitle(updated.title)",
    );
    expect(courseUpdateRoute).toMatch(
      /effectiveAllowedTagIds = isPrivateCourse\s*\? \[\]/,
    );
  });
});
