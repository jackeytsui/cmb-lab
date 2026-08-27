import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("coach student administration boundary", () => {
  it("shows coaches progress and chapter unlocks without account administration", () => {
    const studentPage = source(
      "src/app/(dashboard)/admin/students/[studentId]/page.tsx",
    );

    expect(studentPage).toContain(
      'const usersHref = isAdmin ? "/admin/users" : "/coach/students"',
    );
    expect(studentPage).toContain(
      'student.role === "student" && canManuallyUnlockCourseLibrary',
    );
    expect(studentPage).toMatch(
      /\{isAdmin \? \([\s\S]*?<StudentRoleAssignment[\s\S]*?\) : null\}/,
    );
    expect(studentPage).toContain(
      '{isAdmin && student.role === "student" && (',
    );
    expect(studentPage).toMatch(
      /\{isAdmin \? \([\s\S]*?<StudentTagsSection[\s\S]*?\) : null\}/,
    );
  });

  it("reserves role, tag, and coach-assignment mutations for administrators", () => {
    const coachAssignment = source(
      "src/app/api/admin/students/[studentId]/coach/route.ts",
    );
    const roles = source(
      "src/app/api/admin/students/[studentId]/roles/route.ts",
    );
    const studentTags = source(
      "src/app/api/students/[studentId]/tags/route.ts",
    );

    expect(coachAssignment).toContain('hasMinimumRole("admin")');
    expect(coachAssignment).not.toContain('hasMinimumRole("coach")');
    expect(roles.match(/hasMinimumRole\("admin"\)/g)).toHaveLength(3);
    expect(roles).not.toContain('hasMinimumRole("coach")');
    expect(studentTags.match(/hasMinimumRole\("admin"\)/g)).toHaveLength(3);
    expect(studentTags).not.toContain('hasMinimumRole("coach")');
  });

  it("confines coach progress and CRM reads to assigned students", () => {
    const progressToggle = source(
      "src/app/api/admin/students/[studentId]/progress/toggle/route.ts",
    );
    const ghlProfile = source(
      "src/app/api/students/[studentId]/ghl-profile/route.ts",
    );
    const roleAttribution = source(
      "src/app/api/admin/roles/analytics/route.ts",
    );

    for (const route of [progressToggle, ghlProfile, roleAttribution]) {
      expect(route).toContain("getStaffStudentAccessContext");
      expect(route).toContain("canStaffAccessStudent");
      expect(route).toContain('assignedCoachId: student.assignedCoachId');
    }
    expect(roleAttribution).toContain('access.actor.role !== "admin"');
  });
});
