import { canStaffAccessStudent } from "@/lib/coach-student-scope";
import type { PlatformRole } from "@/lib/platform-roles";

export type CoachingSessionAccessRecord = {
  type: "one_on_one" | "inner_circle";
  createdBy: string;
  studentEmail: string | null;
};

export type CoachingSessionActor = {
  id: string;
  role: PlatformRole;
};

export type CoachingStudentAssignment = {
  assignedCoachId: string | null;
  additionalCoachIds: readonly string[] | null;
} | null;

/**
 * Mirrors the coaching read boundary: Inner Circle notes are shared by staff,
 * while 1:1 notes are limited to the session creator or an assigned coach.
 */
export function canStaffManageCoachingSessionRecord({
  actor,
  session,
  student,
}: {
  actor: CoachingSessionActor;
  session: CoachingSessionAccessRecord;
  student: CoachingStudentAssignment;
}): boolean {
  if (actor.role === "admin" || session.createdBy === actor.id) return true;
  if (session.type === "inner_circle") return actor.role === "coach";
  if (!student) return false;

  return canStaffAccessStudent({
    actorUserId: actor.id,
    actorRole: actor.role,
    assignedCoachId: student.assignedCoachId,
    additionalCoachIds: student.additionalCoachIds,
  });
}
