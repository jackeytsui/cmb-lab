import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Course Library progress management", () => {
  it("offers student-support staff an exact next-lesson control", () => {
    const component = source(
      "src/components/admin/StudentCourseLibraryUnlock.tsx",
    );

    expect(component).toContain("Assign a new course");
    expect(component).toContain("Unassigned course");
    expect(component).toContain("Assign selected course");
    expect(component).toContain("Manage progress for assigned courses");
    expect(component).toContain("Assigned course");
    expect(component).toContain("Lesson to open next");
    expect(component).toContain('action: "set_next_lesson"');
    expect(component).toContain('action: "grant_course"');
    expect(component).toContain("Admin, coach &amp; consultant");
    expect(component).toMatch(
      /quiz\s+answers,\s+submissions, recordings, notes/,
    );
  });

  it("uses the narrow support scope and records an audit event", () => {
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts",
    );

    expect(route).toContain("canAccessStudentSupportTools");
    expect(route).toContain("canProvideStudentSupport(actor.role)");
    expect(route).toContain("planManualLessonPosition");
    expect(route).toContain("course_progress.staff_reposition");
    expect(route).toContain("completed_at = NULL");
  });

  it("lists every published course and atomically grants a missing entitlement", () => {
    const loader = source("src/lib/course-library-student-progress.ts");
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts",
    );

    expect(loader).toContain("includeUnassignedPublished");
    expect(route).toContain("includeUnassignedPublished: true");
    expect(route).toContain("UPDATE course_library_courses");
    expect(route).toContain("allowed_user_ids");
    expect(route).toContain("course_access.staff_grant");
    expect(route).toContain("...accessGrantQueries(changedAt)");
    expect(route).toContain("courseAccessGranted");
    expect(route).toContain('z.literal("grant_course")');
    expect(route).toContain('action === "grant_course"');
  });

  it("preserves the legacy chapter-unlock request shape", () => {
    const route = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts",
    );

    expect(route).toContain("progressMutationSchema");
    expect(route).toContain("planManualChapterUnlock");
    expect(route).toContain("course_progress.manual_unlock");
  });
});
