import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const studentLibrarySource = readFileSync(
  path.join(
    process.cwd(),
    "src/app/(dashboard)/dashboard/course-library/page.tsx",
  ),
  "utf8",
);

describe("student course-library progress query", () => {
  it("does not count soft-deleted modules or lessons", () => {
    const moduleFilter = studentLibrarySource.match(
      /\.leftJoin\(\s*courseLibraryModules,[\s\S]*?\)\s*,?\s*\)\s*\.leftJoin/,
    )?.[0];
    const lessonFilter = studentLibrarySource.match(
      /\.leftJoin\(\s*courseLibraryLessons,[\s\S]*?\)\s*,?\s*\)\s*\.leftJoin/,
    )?.[0];

    expect(moduleFilter).toContain("isNull(courseLibraryModules.deletedAt)");
    expect(lessonFilter).toContain("isNull(courseLibraryLessons.deletedAt)");
  });
});
