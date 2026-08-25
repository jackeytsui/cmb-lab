import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { courseCoverImagePath } from "@/lib/course-cover-image";

describe("courseCoverImagePath", () => {
  it("changes the browser cache key when the course timestamp changes", () => {
    const before = courseCoverImagePath(
      "course-id",
      "2026-08-25T06:12:56.000Z",
    );
    const after = courseCoverImagePath(
      "course-id",
      "2026-08-25T06:14:05.095Z",
    );

    expect(before).not.toBe(after);
    expect(after).toBe(
      "/api/course-library/course-image/course-id?v=2026-08-25T06%3A14%3A05.095Z",
    );
  });

  it("uses the persisted update timestamp on every course-cover surface", () => {
    const files = [
      "src/app/(dashboard)/admin/course-library/CourseLibraryListClient.tsx",
      "src/app/(dashboard)/admin/course-library/[courseId]/CourseLibraryEditorClient.tsx",
      "src/app/(dashboard)/dashboard/course-library/page.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source).toContain("courseCoverImagePath(course.id, course.updatedAt)");
    }
  });
});
