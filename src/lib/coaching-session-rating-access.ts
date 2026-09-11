import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coachingSessions } from "@/db/schema";
import { userCanUseFeature } from "@/lib/feature-access";

type StudentIdentity = {
  id: string;
  email: string;
  role: string;
};

/**
 * Resolve a coaching session only when the student is entitled to that
 * coaching surface. This keeps rating and prompt mutations inside the same
 * boundary as the coaching pages themselves.
 */
export async function getRateableCoachingSession(
  user: StudentIdentity,
  sessionId: string,
) {
  if (user.role !== "student") return null;

  const session = await db.query.coachingSessions.findFirst({
    where: eq(coachingSessions.id, sessionId),
    columns: {
      id: true,
      type: true,
      title: true,
      studentEmail: true,
      createdAt: true,
    },
  });
  if (!session) return null;

  if (session.type === "one_on_one") {
    const ownsSession =
      session.studentEmail?.trim().toLowerCase() ===
      user.email.trim().toLowerCase();
    if (!ownsSession) return null;
    return (await userCanUseFeature(user, "one_on_one_coaching"))
      ? session
      : null;
  }

  return (await userCanUseFeature(user, "inner_circle_group_coaching"))
    ? session
    : null;
}
