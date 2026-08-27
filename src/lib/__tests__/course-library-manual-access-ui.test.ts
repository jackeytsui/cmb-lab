import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editor = readFileSync(
  "src/app/(dashboard)/admin/course-library/[courseId]/CourseLibraryEditorClient.tsx",
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
});
