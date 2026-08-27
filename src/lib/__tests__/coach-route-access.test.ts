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
    const middleware = source("src/proxy.ts");

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

  it("confines pronunciation and practice analytics to assigned students", () => {
    const pronunciation = source(
      "src/app/(dashboard)/coach/pronunciation/page.tsx",
    );
    const practiceResultsApi = source(
      "src/app/api/coach/practice-results/route.ts",
    );
    const practiceResultsQuery = source("src/lib/coach-practice.ts");

    expect(pronunciation).toContain("getStaffStudentAccessContext");
    expect(pronunciation).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(pronunciation).toContain("<h1");
    expect(practiceResultsApi).toContain("getStaffStudentAccessContext");
    expect(practiceResultsApi).toContain("access.actor.id");
    expect(practiceResultsQuery).toContain(
      "eq(users.assignedCoachId, assignedCoachId)",
    );
  });

  it("confines video-thread reads and feedback to assigned students", () => {
    const threadList = source(
      "src/app/(dashboard)/coach/thread-reviews/page.tsx",
    );
    const threadDetail = source(
      "src/app/(dashboard)/coach/thread-reviews/[sessionId]/page.tsx",
    );
    const submissionsApi = source(
      "src/app/api/admin/video-threads/[threadId]/submissions/route.ts",
    );
    const submissionDetailApi = source(
      "src/app/api/admin/video-threads/[threadId]/submissions/[sessionId]/route.ts",
    );
    const submissionResponseApi = source(
      "src/app/api/admin/video-threads/[threadId]/submissions/[sessionId]/respond/route.ts",
    );

    expect(threadList).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(threadDetail).toContain("canStaffAccessStudent");
    expect(submissionsApi).toContain(
      "eq(users.assignedCoachId, access.actor.id)",
    );
    expect(submissionDetailApi).toContain("canStaffAccessStudent");
    expect(submissionResponseApi).toContain("canStaffAccessStudent");
    expect(submissionResponseApi).toContain("coachId: access.realActor.id");
  });

  it("reserves View As impersonation for the real administrator identity", () => {
    const viewAsApi = source("src/app/api/admin/view-as/route.ts");

    expect(viewAsApi).toContain("getRealUser");
    expect(viewAsApi).not.toContain('hasMinimumRole("coach")');
    expect(viewAsApi.match(/realUser\.role !== "admin"/g)).toHaveLength(3);
  });

  it("confines assignment progress and deletion to the creating coach", () => {
    const videoDetail = source(
      "src/app/(dashboard)/coach/video-assignments/[assignmentId]/page.tsx",
    );
    const threadDetail = source(
      "src/app/(dashboard)/coach/thread-assignments/[assignmentId]/page.tsx",
    );
    const videoDeleteApi = source(
      "src/app/api/admin/video-assignments/[assignmentId]/route.ts",
    );
    const threadAssignmentApi = source(
      "src/app/api/admin/thread-assignments/[assignmentId]/route.ts",
    );
    const videoQueries = source("src/lib/video-assignments.ts");
    const threadQueries = source("src/lib/thread-assignments.ts");

    for (const route of [
      videoDetail,
      threadDetail,
      videoDeleteApi,
      threadAssignmentApi,
    ]) {
      expect(route).toContain("getStaffStudentAccessContext");
      expect(route).toContain(
        'access.actor.role === "admin" ? null : access.actor.id',
      );
    }
    expect(videoDetail).toContain("notFound()");
    expect(threadDetail).toContain("notFound()");
    expect(videoQueries.match(/eq\(videoAssignments\.assignedBy, assignedById\)/g))
      .toHaveLength(2);
    expect(threadQueries.match(/eq\(threadAssignments\.assignedBy, assignedById\)/g))
      .toHaveLength(2);
  });

  it("protects the coach video-prompt library and its uploaded media", () => {
    const promptCollection = source(
      "src/app/api/coach/video-prompts/route.ts",
    );
    const promptDelete = source(
      "src/app/api/coach/video-prompts/[promptId]/route.ts",
    );
    const promptClient = source(
      "src/app/(dashboard)/coach/video-prompts/VideoPromptsClient.tsx",
    );
    const muxUpload = source("src/app/api/admin/mux/upload-url/route.ts");
    const muxStatus = source("src/app/api/admin/mux/check-status/route.ts");
    const uploadsList = source("src/app/api/admin/uploads/route.ts");
    const uploadsAssign = source("src/app/api/admin/uploads/assign/route.ts");
    const uploadsPage = source(
      "src/app/(dashboard)/admin/content/uploads/page.tsx",
    );

    expect(promptCollection).toContain("getStaffStudentAccessContext");
    expect(promptCollection).toContain(
      "eq(videoUploads.uploadedBy, access.realActor.clerkId)",
    );
    expect(promptCollection).toContain("coachId: access.realActor.id");
    expect(promptDelete).toContain("getStaffStudentAccessContext");
    expect(promptDelete).toContain(
      "eq(videoPrompts.coachId, access.actor.id)",
    );
    expect(promptClient).toContain("/api/coach/video-prompts/${id}");
    expect(promptClient).not.toContain("/api/coach/video-prompts?id=");
    expect(muxUpload).toContain("getRealUser");
    expect(muxUpload).toContain("isStaffRole(currentUser.role)");
    expect(muxUpload).toContain("createUploadSchema.safeParse");
    expect(muxUpload).toContain('z.enum(["lesson", "prompt", "other"])');
    expect(muxUpload).toContain("uploadedBy: currentUser.clerkId");
    expect(muxStatus).toContain(
      "eq(videoUploads.uploadedBy, currentUser.clerkId)",
    );
    expect(muxStatus).toContain("eq(videoUploads.id, uploadRecord.id)");
    for (const uploadSurface of [uploadsList, uploadsAssign, uploadsPage]) {
      expect(uploadSurface).toContain("getRealUser");
      expect(uploadSurface).toContain(
        "eq(videoUploads.uploadedBy, currentUser.clerkId)",
      );
    }
    expect(uploadsAssign).toContain("assignUploadsSchema.safeParse");
    expect(uploadsAssign).toContain("Each upload and lesson may appear only once");
  });
});
