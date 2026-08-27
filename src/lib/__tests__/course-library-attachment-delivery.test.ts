import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const viewer = readFileSync(
  "src/app/(dashboard)/dashboard/course-library/[courseId]/lessons/[lessonId]/page.tsx",
  "utf8",
);
const downloadRoute = readFileSync(
  "src/app/api/course-library/download/[lessonId]/route.ts",
  "utf8",
);

describe("Course Library attachment delivery", () => {
  it("routes uploaded attachments through the authenticated download proxy", () => {
    expect(viewer).toContain(
      "`/api/course-library/download/${lessonId}?attachment=${index}`",
    );
    expect(viewer).not.toContain("href={att.url}");
  });

  it("keeps course and progression authorization on attachment downloads", () => {
    expect(downloadRoute).toContain("canUserAccessCourseLibraryLesson");
    expect(downloadRoute).toContain(
      'request.nextUrl.searchParams.get("attachment")',
    );
    expect(downloadRoute).toContain("isPrivateVercelBlobUrl(fileUrl)");
    expect(downloadRoute).toContain('label = "course-library/attachment"');
  });
});
