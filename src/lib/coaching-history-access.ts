import "server-only";

import { cache } from "react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { coachingSessions, users } from "@/db/schema";

/**
 * Students keep read-only access to their own 1:1 archive after the active
 * coaching entitlement ends. Mutating coaching routes remain staff-only.
 */
export const hasOneOnOneCoachingHistory = cache(async (userId: string) => {
  const [session] = await db
    .select({ id: coachingSessions.id })
    .from(coachingSessions)
    .innerJoin(
      users,
      and(
        eq(users.id, userId),
        sql`lower(trim(${coachingSessions.studentEmail})) = lower(trim(${users.email}))`,
      ),
    )
    .where(eq(coachingSessions.type, "one_on_one"))
    .limit(1);

  return Boolean(session);
});
