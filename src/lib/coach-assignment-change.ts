import { sql } from "drizzle-orm";
import { z } from "zod";
import { users } from "@/db/schema/users";

export const coachAssignmentChangeSchema = z.union([
  z.object({ coachId: z.uuid().nullable() }).strict(),
  z.object({ addCoachId: z.uuid() }).strict(),
  z.object({ removeCoachId: z.uuid() }).strict(),
]);

/** Atomic, idempotent per-coach edits; never overwrite a stale shared list. */
export function coachAssignmentUpdate(body: z.infer<typeof coachAssignmentChangeSchema>) {
  if ("coachId" in body) {
    return {
      assignedCoachId: body.coachId,
      ...(body.coachId ? { additionalCoachIds: sql<string[]>`array_remove(${users.additionalCoachIds}, ${body.coachId}::uuid)` } : {}),
    };
  }
  if ("addCoachId" in body) {
    return { additionalCoachIds: sql<string[]>`CASE
      WHEN ${users.assignedCoachId} = ${body.addCoachId}::uuid
        OR ${body.addCoachId}::uuid = ANY(${users.additionalCoachIds})
      THEN ${users.additionalCoachIds}
      ELSE array_append(${users.additionalCoachIds}, ${body.addCoachId}::uuid)
    END` };
  }
  return { additionalCoachIds: sql<string[]>`array_remove(${users.additionalCoachIds}, ${body.removeCoachId}::uuid)` };
}
