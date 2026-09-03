import { isStaffRole, type PlatformRole } from "@/lib/platform-roles";

type CoachStudentScopeInput = {
  realUserId: string;
  realRole: PlatformRole;
  viewedUserId: string;
  viewedRole: PlatformRole;
  myStudents: boolean;
  requestedCoachId: string;
};

type StaffStudentAccessInput = {
  actorUserId: string;
  actorRole: PlatformRole;
  assignedCoachId: string | null;
  additionalCoachIds?: readonly string[] | null;
};

type CoachingStudentAccessInput = StaffStudentAccessInput & {
  studentUserId: string;
};

/**
 * Resolve the only coach whose students may be returned.
 * `null` means an unfiltered administrator view.
 */
export function resolveCoachStudentScope({
  realUserId,
  realRole,
  viewedUserId,
  viewedRole,
  myStudents,
  requestedCoachId,
}: CoachStudentScopeInput): string | null {
  if (realRole !== "admin") return realUserId;

  // Preserve the admin View As experience without giving non-admin accounts
  // control over the viewed identity.
  if (viewedUserId !== realUserId && viewedRole !== "admin") {
    return viewedUserId;
  }

  if (myStudents) return realUserId;
  if (requestedCoachId && requestedCoachId !== "all") {
    return requestedCoachId;
  }
  return null;
}

/**
 * Administrators may open any student record. Other staff may only open
 * students explicitly assigned to their own account.
 */
export function canStaffAccessStudent({
  actorUserId,
  actorRole,
  assignedCoachId,
  additionalCoachIds,
}: StaffStudentAccessInput): boolean {
  return actorRole === "admin" || (isStaffRole(actorRole) && (
    assignedCoachId === actorUserId ||
    (additionalCoachIds ?? []).includes(actorUserId)
  ));
}

/**
 * Student-facing coaching reads allow learners to see only themselves, while
 * staff follow the same assigned-coach boundary as the coach workspace.
 */
export function canAccessCoachingStudent({
  actorUserId,
  actorRole,
  studentUserId,
  assignedCoachId,
  additionalCoachIds,
}: CoachingStudentAccessInput): boolean {
  if (actorRole === "student") return actorUserId === studentUserId;
  return canStaffAccessStudent({
    actorUserId,
    actorRole,
    assignedCoachId,
    additionalCoachIds,
  });
}
