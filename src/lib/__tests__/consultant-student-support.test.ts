import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("consultant student support", () => {
  it("exposes student creation from the staff student workspace", () => {
    const page = source("src/app/(dashboard)/coach/students/page.tsx");
    const client = source(
      "src/app/(dashboard)/coach/students/CoachStudentsClient.tsx",
    );
    const dialog = source("src/components/admin/AddUserQuickDialog.tsx");

    expect(page).toContain("canProvideStudentSupport(currentDbUser.role)");
    expect(client).toContain("<AddUserQuickDialog studentOnly={!isAdmin}");
    expect(dialog).toContain('studentOnly ? "student" : form.role');
    expect(dialog).toContain('studentOnly ? "Add Student" : "Add Contact"');
  });

  it("keeps support-created accounts student-only and blocks destructive tools", () => {
    const route = source("src/app/api/admin/students/invitations/route.ts");

    expect(route).toContain("canProvideStudentSupport(actor.role)");
    expect(route).toContain('requestedRole !== "student"');
    expect(route).toContain('action === "remove_access"');
    expect(route).toContain("!isAdmin && user");
    expect(route).toContain("custom-email controls require an administrator");
  });

  it("keeps course and tag writes inside the assigned-student boundary", () => {
    const courseRoute = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts",
    );
    const tagRoute = source("src/app/api/students/[studentId]/tags/route.ts");

    for (const route of [courseRoute, tagRoute]) {
      expect(route).toContain("canStaffAccessStudent");
      expect(route).toContain("additionalCoachIds");
    }
    expect(tagRoute).toContain("setStaffTagOverride");
  });
});
