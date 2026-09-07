import { describe, expect, it } from "vitest";
import { canStaffManageCoachingSessionRecord } from "@/lib/coaching-session-policy";

const oneOnOne = {
  type: "one_on_one" as const,
  createdBy: "original-coach",
  studentEmail: "student@example.com",
};

describe("coaching session write access", () => {
  it("allows admins, session creators, and assigned coaches", () => {
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "admin", role: "admin" },
        session: oneOnOne,
        student: null,
      }),
    ).toBe(true);
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "original-coach", role: "coach" },
        session: oneOnOne,
        student: null,
      }),
    ).toBe(true);
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "new-coach", role: "coach" },
        session: oneOnOne,
        student: {
          assignedCoachId: "new-coach",
          additionalCoachIds: [],
        },
      }),
    ).toBe(true);
  });

  it("allows additional coaches and rejects unrelated staff", () => {
    const student = {
      assignedCoachId: "primary-coach",
      additionalCoachIds: ["additional-coach"],
    };
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "additional-coach", role: "coach" },
        session: oneOnOne,
        student,
      }),
    ).toBe(true);
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "unrelated-coach", role: "coach" },
        session: oneOnOne,
        student,
      }),
    ).toBe(false);
  });

  it("keeps Inner Circle notes shared between coaches", () => {
    expect(
      canStaffManageCoachingSessionRecord({
        actor: { id: "any-coach", role: "coach" },
        session: {
          type: "inner_circle",
          createdBy: "different-coach",
          studentEmail: null,
        },
        student: null,
      }),
    ).toBe(true);
  });
});
