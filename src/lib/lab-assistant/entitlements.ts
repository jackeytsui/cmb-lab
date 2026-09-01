import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { studentTags, tags } from "@/db/schema";
import { isStaffRole } from "@/lib/platform-roles";
import type { LabAssistantCoachingAccess } from "./entitlement-policy";

export const LAB_ASSISTANT_COACHING_TAGS = {
  innerCircle: "icgc_student",
  oneOnOne: "1on1_student",
} as const;

/**
 * Resolve private coaching access from the signed-in CMB Lab account. Student
 * access is explicit and tag-based; an absent tag is a denial. Staff retain
 * full access for support and QA.
 */
export async function getLabAssistantCoachingAccess(user: {
  id: string;
  role?: string | null;
}): Promise<LabAssistantCoachingAccess> {
  if (isStaffRole(user.role)) {
    return { innerCircle: true, oneOnOne: true };
  }

  const tagNames = Object.values(LAB_ASSISTANT_COACHING_TAGS);
  const rows = await db
    .select({ name: tags.name })
    .from(studentTags)
    .innerJoin(tags, eq(tags.id, studentTags.tagId))
    .where(
      and(
        eq(studentTags.userId, user.id),
        inArray(tags.name, tagNames),
      ),
    );

  const assigned = new Set(rows.map((row) => row.name));
  return {
    innerCircle: assigned.has(LAB_ASSISTANT_COACHING_TAGS.innerCircle),
    oneOnOne: assigned.has(LAB_ASSISTANT_COACHING_TAGS.oneOnOne),
  };
}
