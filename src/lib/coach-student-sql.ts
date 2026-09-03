import { arrayContains, eq, or } from "drizzle-orm";
import { users } from "@/db/schema/users";

/** Keep list filtering identical to canStaffAccessStudent's assignment rule. */
export function studentAssignedToCoach(coachId: string) {
  return or(
    eq(users.assignedCoachId, coachId),
    arrayContains(users.additionalCoachIds, [coachId]),
  )!;
}
