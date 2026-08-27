import { getCurrentUser, getRealUser } from "@/lib/auth";
import { isStaffRole } from "@/lib/platform-roles";

/**
 * Authorize with the real Clerk account, then safely project an administrator's
 * View As identity for student-assignment scoping.
 */
export async function getStaffStudentAccessContext() {
  const realActor = await getRealUser();
  if (!realActor) {
    return { status: "unauthenticated", realActor: null, actor: null } as const;
  }
  if (!isStaffRole(realActor.role)) {
    return { status: "forbidden", realActor, actor: null } as const;
  }

  const actor =
    realActor.role === "admin"
      ? (await getCurrentUser()) ?? realActor
      : realActor;
  if (!isStaffRole(actor.role)) {
    return { status: "forbidden", realActor, actor: null } as const;
  }

  return { status: "authorized", realActor, actor } as const;
}
