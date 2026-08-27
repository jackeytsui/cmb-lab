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
