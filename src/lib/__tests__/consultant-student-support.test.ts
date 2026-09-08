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
    expect(page).toContain('currentDbUser.role === "consultant"');
    expect(client).toContain("supportMode={supportMode}");
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

  it("gives consultants a global, support-only student surface", () => {
    const listRoute = source(
      "src/app/api/coach/students/with-ratings/route.ts",
    );
    const supportPage = source(
      "src/app/(dashboard)/coach/students/[studentId]/page.tsx",
    );
    const client = source(
      "src/app/(dashboard)/coach/students/CoachStudentsClient.tsx",
    );

    expect(listRoute).toContain('viewedUser.role === "consultant"');
    expect(listRoute).toContain("!supportMode && studentRows.length > 0");
    expect(client).toContain("Private coaching records remain restricted");
    expect(client).toContain("/coach/students/${student.id}");
    expect(supportPage).toContain("canAccessStudentSupportTools");
    expect(supportPage).toContain("<StudentTagsSection");
    expect(supportPage).toContain("<StudentCourseLibraryUnlock");
    for (const privateComponent of [
      "ActivityTimeline",
      "GhlProfileSection",
      "StudentProgressView",
      "Conversation",
      "Submission",
    ]) {
      expect(supportPage).not.toContain(privateComponent);
    }
  });

  it("authorizes global consultant course and tag support without widening private coaching data", () => {
    const courseRoute = source(
      "src/app/api/admin/students/[studentId]/course-library-unlock/route.ts",
    );
    const tagRoute = source("src/app/api/students/[studentId]/tags/route.ts");

    for (const route of [courseRoute, tagRoute]) {
      expect(route).toContain("canAccessStudentSupportTools");
      expect(route).toContain("additionalCoachIds");
    }
    expect(tagRoute).toContain("setStaffTagOverride");

    for (const privateRoute of [
      "src/app/api/conversations/route.ts",
      "src/app/api/submissions/[submissionId]/feedback/route.ts",
      "src/app/api/students/[studentId]/ghl-profile/route.ts",
    ]) {
      expect(source(privateRoute)).toContain("canStaffAccessStudent");
      expect(source(privateRoute)).not.toContain(
        "canAccessStudentSupportTools",
      );
    }
  });
});
