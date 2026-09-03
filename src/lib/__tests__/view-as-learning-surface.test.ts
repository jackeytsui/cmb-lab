import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string) {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("View As learning-surface fidelity", () => {
  it("evaluates feature and Course Library access for the selected user", () => {
    const featureGate = source("src/components/auth/FeatureGate.tsx");
    const courseLibraryGate = source(
      "src/components/course-library/CourseLibraryGate.tsx",
    );

    for (const gate of [featureGate, courseLibraryGate]) {
      expect(gate).toContain("getCurrentUser");
      expect(gate).not.toContain("users.clerkId");
    }
    expect(featureGate).toContain("userCanUseFeature(user, feature)");
    expect(courseLibraryGate).toContain("canViewCourseLibrary(user)");
  });

  it("hides staff-only coaching and listening controls in a student preview", () => {
    const oneOnOne = source(
      "src/app/(dashboard)/dashboard/coaching/one-on-one/page.tsx",
    );
    const innerCircle = source(
      "src/app/(dashboard)/dashboard/coaching/inner-circle/page.tsx",
    );
    const recommendations = source(
      "src/app/api/listening/recommendations/route.ts",
    );

    for (const coachingPage of [oneOnOne, innerCircle]) {
      expect(coachingPage).toContain("getCurrentUser");
      expect(coachingPage).not.toContain("getRealUser");
    }
    expect(recommendations).toContain(
      "const canManage = isStaffRole(viewedUser?.role)",
    );
    expect(recommendations.match(/hasMinimumRole\("coach"\)/g)).toHaveLength(3);
  });

  it("loads coaching identity and progress for the selected learner", () => {
    const client = source(
      "src/app/(dashboard)/dashboard/coaching/CoachingMaterialClient.tsx",
    );
    const sessions = source("src/app/api/coaching/sessions/route.ts");
    const sessionRead = sessions
      .split("export async function GET")[1]
      .split("export async function POST")[0];
    const sessionMutation = sessions.split("export async function POST")[1];
    const selectedUserReads = [
      "src/app/api/coaching/sessions/[sessionId]/rating/route.ts",
      "src/app/api/coaching/rating-prompt/route.ts",
      "src/app/api/coaching/notes/[noteId]/star/route.ts",
    ];

    expect(client).toContain("currentEmail?: string");
    expect(client).toContain("currentEmail ||");
    expect(sessionRead).toContain("getCurrentUser()");
    expect(sessionRead).not.toContain("getRealUser()");
    expect(sessionRead).toContain(
      ".innerJoin(coachingNotes, eq(coachingNoteStars.noteId, coachingNotes.id))",
    );
    expect(sessionRead).not.toContain(
      "inArray(coachingNoteStars.noteId, noteIds)",
    );
    expect(sessionMutation).toContain("getRealUser()");

    for (const file of selectedUserReads) {
      expect(source(file), file).toContain("getCurrentUser");
    }
  });

  it("keeps coach coaching-data reads inside assigned-student scope", () => {
    const picker = source("src/app/api/coach/my-students/route.ts");
    const scopedRoutes = [
      "src/app/api/coaching/sessions/route.ts",
      "src/app/api/coaching/student-course-progress/route.ts",
      "src/app/api/coaching/goals/route.ts",
      "src/app/api/coaching/student-end-date/route.ts",
      "src/app/api/coaching/student-level/route.ts",
      "src/app/api/coaching/export/route.ts",
    ];

    expect(picker).toContain("getStaffStudentAccessContext");
    expect(picker).toContain(
      "studentAssignedToCoach(access.actor.id)",
    );
    expect(picker).not.toContain("getRealUser");

    for (const file of scopedRoutes) {
      expect(source(file), file).toContain("getCoachingStudentAccess");
    }
  });

  it("keeps Accelerator progress and edit controls scoped to the selected user", () => {
    const selectedUserPages = [
      "src/app/(dashboard)/dashboard/accelerator/page.tsx",
      "src/app/(dashboard)/dashboard/accelerator/typing/page.tsx",
      "src/app/(dashboard)/dashboard/accelerator/scripts/page.tsx",
      "src/app/(dashboard)/dashboard/accelerator/scripts/[scriptId]/page.tsx",
      "src/app/(dashboard)/dashboard/accelerator/reader/page.tsx",
      "src/app/(dashboard)/dashboard/accelerator/reader/[passageId]/page.tsx",
      "src/app/api/accelerator/content-completion/route.ts",
      "src/app/api/accelerator/reader/progress/route.ts",
    ];

    for (const file of selectedUserPages) {
      const contents = source(file);
      expect(contents, file).toContain("getCurrentUser");
      expect(contents, file).not.toContain("users.clerkId");
    }

    const adminEditLink = source(
      "src/app/(dashboard)/dashboard/accelerator/AdminEditLink.tsx",
    );
    expect(adminEditLink).toContain("getCurrentUser");
    expect(adminEditLink).toContain("isStaffRole(user?.role)");
  });
});
