import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Course Library progress management", () => {
  it("offers admins and coaches an exact next-lesson control", () => {
    const component = source(
      "src/components/admin/StudentCourseLibraryUnlock.tsx"
    );

    expect(component).toContain("Set the student&apos;s next lesson");
    expect(component).toContain("Lesson to open next");
    expect(component).toContain('action: "set_next_lesson"');
    expect(component).toMatch(/quiz\s+answers, submissions, recordings, notes/);
  });

  it("keeps the existing coach scope and records an audit event", () => {
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts"
    );

    expect(route).toContain("canStaffAccessStudent");
    expect(route).toContain('role === "admin" || role === "coach"');
    expect(route).toContain("planManualLessonPosition");
    expect(route).toContain("course_progress.staff_reposition");
    expect(route).toContain("completed_at = NULL");
  });

  it("lists every published course and atomically grants a missing entitlement", () => {
    const loader = source("src/lib/course-library-student-progress.ts");
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts"
    );

    expect(loader).toContain("includeUnassignedPublished");
    expect(route).toContain("includeUnassignedPublished: true");
    expect(route).toContain("UPDATE course_library_courses");
    expect(route).toContain("allowed_user_ids");
    expect(route).toContain("course_access.staff_grant");
    expect(route).toContain("...accessGrantQueries(changedAt)");
    expect(route).toContain("courseAccessGranted");
  });

  it("preserves the legacy chapter-unlock request shape", () => {
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts"
    );

    expect(route).toContain("progressMutationSchema");
    expect(route).toContain("planManualChapterUnlock");
    expect(route).toContain("course_progress.manual_unlock");
  });
});
