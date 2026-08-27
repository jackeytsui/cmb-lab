import { describe, expect, it } from "vitest";
import {
  canStaffAccessStudent,
  resolveCoachStudentScope,
} from "@/lib/coach-student-scope";

const base = {
  realUserId: "coach-real",
  realRole: "coach" as const,
  viewedUserId: "coach-real",
  viewedRole: "coach" as const,
  myStudents: false,
  requestedCoachId: "",
};

describe("coach student data scope", () => {
  it("always confines non-admin staff to their own assigned students", () => {
    expect(resolveCoachStudentScope(base)).toBe("coach-real");
    expect(
      resolveCoachStudentScope({
        ...base,
        requestedCoachId: "another-coach",
      }),
    ).toBe("coach-real");
    expect(
      resolveCoachStudentScope({
        ...base,
        realRole: "operations",
        requestedCoachId: "all",
      }),
    ).toBe("coach-real");
  });

  it("allows administrators to filter or intentionally view all students", () => {
    const admin = {
      ...base,
      realUserId: "admin",
      realRole: "admin" as const,
      viewedUserId: "admin",
      viewedRole: "admin" as const,
    };

    expect(resolveCoachStudentScope(admin)).toBeNull();
    expect(
      resolveCoachStudentScope({
        ...admin,
        requestedCoachId: "coach-a",
      }),
    ).toBe("coach-a");
    expect(
      resolveCoachStudentScope({ ...admin, myStudents: true }),
    ).toBe("admin");
  });

  it("uses the selected staff identity only for an administrator View As session", () => {
    expect(
      resolveCoachStudentScope({
        ...base,
        realUserId: "admin",
        realRole: "admin",
        viewedUserId: "coach-viewed",
        viewedRole: "coach",
        requestedCoachId: "another-coach",
      }),
    ).toBe("coach-viewed");
  });

  it("allows administrators to open any student record", () => {
    expect(
      canStaffAccessStudent({
        actorUserId: "admin",
        actorRole: "admin",
        assignedCoachId: null,
      }),
    ).toBe(true);
    expect(
      canStaffAccessStudent({
        actorUserId: "admin",
        actorRole: "admin",
        assignedCoachId: "coach-a",
      }),
    ).toBe(true);
  });

  it("only allows non-admin staff to open their assigned students", () => {
    for (const actorRole of ["coach", "operations", "consultant"] as const) {
      expect(
        canStaffAccessStudent({
          actorUserId: "coach-a",
          actorRole,
          assignedCoachId: "coach-a",
        }),
      ).toBe(true);
      expect(
        canStaffAccessStudent({
          actorUserId: "coach-a",
          actorRole,
          assignedCoachId: "coach-b",
        }),
      ).toBe(false);
      expect(
        canStaffAccessStudent({
          actorUserId: "coach-a",
          actorRole,
          assignedCoachId: null,
        }),
      ).toBe(false);
    }
  });
});
