import { and, eq, ilike, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  canStaffManageCoachingSessionRecord,
  type CoachingSessionAccessRecord,
  type CoachingSessionActor,
} from "@/lib/coaching-session-policy";

export async function canStaffManageCoachingSession(
  actor: CoachingSessionActor,
  session: CoachingSessionAccessRecord,
): Promise<boolean> {
  if (
    actor.role === "admin" ||
    session.createdBy === actor.id ||
    session.type === "inner_circle"
  ) {
    return canStaffManageCoachingSessionRecord({ actor, session, student: null });
  }

  const email = session.studentEmail?.trim();
  if (!email) return false;

  const student = await db.query.users.findFirst({
    where: and(
      ilike(users.email, email),
      eq(users.role, "student"),
      isNull(users.deletedAt),
    ),
    columns: {
      assignedCoachId: true,
      additionalCoachIds: true,
    },
  });

  return canStaffManageCoachingSessionRecord({
    actor,
    session,
    student: student ?? null,
  });
}
