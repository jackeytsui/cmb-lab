import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function pageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return pageFiles(absolutePath);
    return entry.name === "page.tsx" ? [absolutePath] : [];
  });
}

describe("coach route access", () => {
  it("authenticates coach routes at the edge and defers roles to the database", () => {
    const middleware = source("src/middleware.ts");

    expect(middleware).toContain('"/coach(.*)"');
    expect(middleware).toContain(
      "if (isCoachRoute(req)) {\n    return NextResponse.next();",
    );
    expect(middleware).not.toContain(
      'isCoachRoute(req) && !hasMinimumPlatformRole(role, "coach")',
    );
  });

  it("keeps every coach page protected by the database role check", () => {
    const coachRoot = path.join(
      process.cwd(),
      "src/app/(dashboard)/coach",
    );
    const pages = pageFiles(coachRoot);

    expect(pages.length).toBeGreaterThan(10);
    for (const page of pages) {
      expect(readFileSync(page, "utf8"), page).toContain(
        'hasMinimumRole("coach")',
      );
    }
  });

  it("exposes a stable dashboard entry point and accessible page title", () => {
    const sidebar = source("src/components/layout/AppSidebar.tsx");
    const dashboard = source("src/app/(dashboard)/coach/page.tsx");

    expect(sidebar).toContain(
      '{ title: "Coach Dashboard", url: "/coach", icon: LayoutDashboard }',
    );
    expect(dashboard).toContain("<h1");
    expect(dashboard).toContain("Coach Dashboard");
  });

  it("confines submission review data and mutations to assigned students", () => {
    const dashboard = source("src/app/(dashboard)/coach/page.tsx");
    const submissionList = source("src/app/api/submissions/route.ts");
    const submissionDetail = source(
      "src/app/(dashboard)/coach/submissions/[submissionId]/page.tsx",
    );
    const feedback = source(
      "src/app/api/submissions/[submissionId]/feedback/route.ts",
    );
    const notes = source(
      "src/app/api/submissions/[submissionId]/notes/route.ts",
    );

    expect(dashboard).toContain("getStaffStudentAccessContext");
    expect(submissionList).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(submissionDetail).toContain(
      "eq(users.assignedCoachId, coachUserId)",
    );
    expect(feedback.match(/canStaffAccessStudent\(/g)).toHaveLength(2);
    expect(notes).toContain("canAccessSubmission");
    expect(notes.match(/canAccessSubmission\(/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("renders conversation review on the server without exposing other coaches' students", () => {
    const conversationList = source(
      "src/app/(dashboard)/coach/conversations/page.tsx",
    );
    const conversationDetail = source(
      "src/app/(dashboard)/coach/conversations/[conversationId]/page.tsx",
    );
    const conversationListApi = source("src/app/api/conversations/route.ts");
    const conversationDetailApi = source(
      "src/app/api/conversations/[conversationId]/route.ts",
    );

    expect(conversationList).not.toContain("onChange=");
    expect(conversationList).toContain("<h1");
    expect(conversationList).toContain("Conversations");
    expect(conversationList).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(conversationDetail).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(conversationListApi).toContain("canStaffAccessStudent");
    expect(conversationDetailApi).toContain("canStaffAccessStudent");
    expect(conversationDetailApi).toContain(
      '{ error: "Conversation not found" }',
    );
  });
});
