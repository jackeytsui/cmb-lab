import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { canAccessCoachingStudent } from "@/lib/coach-student-scope";

type AuthorizedCoachingStudent = {
  ok: true;
  actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;
  student: {
    id: string;
    email: string;
    assignedCoachId: string | null;
  };
};

type DeniedCoachingStudent = {
  ok: false;
  status: 400 | 401 | 403 | 404;
  error: string;
};

/**
 * Resolve a coaching learner against the effective identity. Real coaches are
 * limited to assigned students; an administrator in View As follows the
 * selected role; students can only resolve themselves.
 */
export async function getCoachingStudentAccess(
  requestedEmail?: string | null,
): Promise<AuthorizedCoachingStudent | DeniedCoachingStudent> {
  const actor = await getCurrentUser();
  if (!actor) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const email = (requestedEmail || actor.email || "").trim();
  if (!email) {
    return { ok: false, status: 400, error: "studentEmail required" };
  }

  const student = await db.query.users.findFirst({
    where: and(
      ilike(users.email, email),
      eq(users.role, "student"),
      isNull(users.deletedAt),
    ),
    columns: {
      id: true,
      email: true,
      assignedCoachId: true,
    },
  });
  if (!student) {
    return { ok: false, status: 404, error: "Student not found" };
  }

  if (
    !canAccessCoachingStudent({
      actorUserId: actor.id,
      actorRole: actor.role,
      studentUserId: student.id,
      assignedCoachId: student.assignedCoachId,
    })
  ) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, actor, student };
}
