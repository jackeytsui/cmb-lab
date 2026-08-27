import type { PlatformRole } from "@/lib/platform-roles";

type CoachStudentScopeInput = {
  realUserId: string;
  realRole: PlatformRole;
  viewedUserId: string;
  viewedRole: PlatformRole;
  myStudents: boolean;
  requestedCoachId: string;
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
