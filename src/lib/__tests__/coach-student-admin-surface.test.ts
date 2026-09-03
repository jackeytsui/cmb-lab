import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("coach student administration boundary", () => {
  it("shows coaches progress and chapter unlocks without account administration", () => {
    const studentPage = source(
      "src/app/(dashboard)/admin/students/[studentId]/page.tsx"
    );

    expect(studentPage).toContain(
      'const usersHref = isAdmin ? "/admin/users" : "/coach/students"'
    );
    expect(studentPage).toContain(
      'student.role === "student" && canManuallyUnlockCourseLibrary'
    );
    expect(studentPage).toMatch(
      /\{isAdmin \? \([\s\S]*?<StudentRoleAssignment[\s\S]*?\) : null\}/
    );
    expect(studentPage).toContain(
      '{isAdmin && student.role === "student" && ('
    );
    expect(studentPage).toContain("<StudentTagsSection");
    expect(studentPage).toContain("canManageTagDefinitions={isAdmin}");
  });

  it("reserves roles and coach assignment for admins while allowing staff tag overrides", () => {
    const coachAssignment = source(
      "src/app/api/admin/students/[studentId]/coach/route.ts"
    );
    const roles = source(
      "src/app/api/admin/students/[studentId]/roles/route.ts"
    );
    const studentTags = source(
      "src/app/api/students/[studentId]/tags/route.ts"
    );

    expect(coachAssignment).toContain('hasMinimumRole("admin")');
    expect(coachAssignment).not.toContain('hasMinimumRole("coach")');
    expect(roles.match(/hasMinimumRole\("admin"\)/g)).toHaveLength(3);
    expect(roles).not.toContain('hasMinimumRole("coach")');
    expect(studentTags).toContain("getStaffStudentAccessContext");
    expect(studentTags).toContain("canStaffAccessStudent");
    expect(studentTags).toContain("setStaffTagOverride");
    expect(studentTags).not.toContain('hasMinimumRole("admin")');
  });

  it("confines coach progress and CRM reads to assigned students", () => {
    const progressToggle = source(
      "src/app/api/admin/students/[studentId]/progress/toggle/route.ts"
    );
    const ghlProfile = source(
      "src/app/api/students/[studentId]/ghl-profile/route.ts"
    );
    const roleAttribution = source(
      "src/app/api/admin/roles/analytics/route.ts"
    );

    for (const route of [progressToggle, ghlProfile, roleAttribution]) {
      expect(route).toContain("getStaffStudentAccessContext");
      expect(route).toContain("canStaffAccessStudent");
      expect(route).toContain("assignedCoachId: student.assignedCoachId");
    }
    expect(roleAttribution).toContain('access.actor.role !== "admin"');
  });

  it("makes staff choices durable across every automated tag writer", () => {
    const tagSync = source("src/lib/ghl/tag-sync.ts");
    const courseProgressSync = source("src/lib/ghl/course-progress-sync.ts");
    const inactiveCron = source("src/app/api/cron/ghl-inactive/route.ts");
    const clerkWebhook = source("src/app/api/webhooks/clerk/route.ts");
    const migration = source(
      "src/db/migrations/0111_staff_tag_overrides.sql"
    );
    const additiveMigration = source(
      "src/db/migrations/0112_additive_staff_controlled_tags.sql"
    );
    const coachingAccess = source("src/lib/coaching-access.ts");

    expect(tagSync).toContain("shouldApplyTagChangeAgainstStaffOverride");
    expect(tagSync).toContain('reason: "staff_override_off"');
    expect(tagSync).toContain('reason: "additive_access_policy"');
    expect(tagSync).not.toContain("await removeTag(userId");
    expect(courseProgressSync).toContain("staffForcedOffTagKeys");
    expect(inactiveCron).toContain("shouldApplyAutomatedTagChange");
    expect(clerkWebhook).toContain("shouldApplyAutomatedTagChange");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "student_tag_overrides"');
    expect(migration).toContain('WHERE "assigned_by" IS NOT NULL');
    expect(additiveMigration).toContain('SET "type" = \'coach\'');
    expect(coachingAccess).not.toContain('type: "system"');
  });
});
