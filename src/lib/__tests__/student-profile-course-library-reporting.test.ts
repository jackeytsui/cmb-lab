import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const profile = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/admin/students/[studentId]/page.tsx",
  ),
  "utf8",
);

describe("staff student profile Course Library reporting", () => {
  it("uses the same Course Library access policy as the chapter unlock flow", () => {
    expect(profile).toContain("loadStudentCourseLibraryProgress({");
    expect(profile).toContain("summarizeCourseLibraryAccessProgress(");
  });

  it("labels active Course Library metrics separately from legacy history", () => {
    expect(profile).toContain('label="Course Library Courses"');
    expect(profile).toContain(
      'label="Course Library Lessons Completed"',
    );
    expect(profile).toContain("Legacy Course Progress");
    expect(profile).not.toContain('label="Courses Enrolled"');
  });
});
