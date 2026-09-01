import { describe, expect, it } from "vitest";
import {
  getPerStudentGrantedCourseIds,
  hasPerStudentCourseGrant,
  resolveCourseLibraryCourseAccess,
} from "@/lib/course-library-access-grants";

describe("Course Library per-student grants", () => {
  const userId = "student-1";

  it("keeps manual exceptions and system-managed imports independent", () => {
    expect(
      hasPerStudentCourseGrant(
        {
          allowedUserIds: [userId],
          systemAccessUserIds: [],
        },
        userId,
      ),
    ).toBe(true);

    expect(
      hasPerStudentCourseGrant(
        {
          allowedUserIds: [],
          systemAccessUserIds: [userId],
        },
        userId,
      ),
    ).toBe(true);
  });

  it("applies per-student access to regular courses as well as customized courses", () => {
    const granted = getPerStudentGrantedCourseIds(
      [
        {
          id: "regular-blueprint-course",
          allowedUserIds: [],
          systemAccessUserIds: [userId],
        },
        {
          id: "customized-course",
          allowedUserIds: [userId],
          systemAccessUserIds: [],
        },
        {
          id: "unrelated-course",
          allowedUserIds: [],
          systemAccessUserIds: [],
        },
      ],
      userId,
    );

    expect([...granted]).toEqual([
      "regular-blueprint-course",
      "customized-course",
    ]);
  });

  it("does not let a broad student tag bypass core GHL progress access", () => {
    expect(
      resolveCourseLibraryCourseAccess({
        isCustomized: false,
        isCoreProgressCourse: true,
        progressGated: true,
        hasPerStudentGrant: false,
        baseAllowed: true,
      }),
    ).toBe(false);

    expect(
      resolveCourseLibraryCourseAccess({
        isCustomized: false,
        isCoreProgressCourse: true,
        progressGated: true,
        hasPerStudentGrant: true,
        baseAllowed: true,
      }),
    ).toBe(true);
  });
});
