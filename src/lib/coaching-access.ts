import "server-only";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { studentTags, tagFeatureGrants, tags, users } from "@/db/schema";

export const BASELINE_STUDENT_COACHING_TAGS = [
  {
    name: "1on1_student",
    color: "#2563eb",
    description: "Controls student access to the 1:1 Coaching tab",
    features: ["one_on_one_coaching"],
  },
  {
    name: "icgc_student",
    color: "#7c3aed",
    description: "Controls student access to Inner Circle and the group coaching schedule",
    features: ["inner_circle_group_coaching", "group_coaching_schedule"],
  },
] as const;

/** Ensure the two coaching access tags and their feature grants exist. */
export async function ensureBaselineStudentCoachingTags() {
  const configured: Array<{ id: string; name: string }> = [];

  for (const definition of BASELINE_STUDENT_COACHING_TAGS) {
    let tag = await db.query.tags.findFirst({
      where: eq(tags.name, definition.name),
      columns: { id: true, name: true },
    });

    if (!tag) {
      [tag] = await db
        .insert(tags)
        .values({
          name: definition.name,
          color: definition.color,
          type: "system",
          description: definition.description,
        })
        .returning({ id: tags.id, name: tags.name });
    }

    await db
      .insert(tagFeatureGrants)
      .values(
        definition.features.map((featureKey) => ({
          tagId: tag.id,
          featureKey,
          grantType: "additive" as const,
        })),
      )
      .onConflictDoNothing();

    configured.push(tag);
  }

  return configured;
}

/**
 * Add baseline coaching tags to student accounts only. Existing tags are never
 * removed, and coach/admin accounts are excluded even if their IDs are passed.
 */
export async function assignBaselineCoachingTagsToStudents(userIds: string[]) {
  if (userIds.length === 0) return { eligibleCount: 0, assignmentsAdded: 0 };

  const eligible = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        inArray(users.id, userIds),
        eq(users.role, "student"),
        isNull(users.deletedAt),
      ),
    );
  if (eligible.length === 0) return { eligibleCount: 0, assignmentsAdded: 0 };

  const configuredTags = await ensureBaselineStudentCoachingTags();
  const inserted = await db
    .insert(studentTags)
    .values(
      eligible.flatMap((user) =>
        configuredTags.map((tag) => ({ userId: user.id, tagId: tag.id })),
      ),
    )
    .onConflictDoNothing()
    .returning({ id: studentTags.id });

  return { eligibleCount: eligible.length, assignmentsAdded: inserted.length };
}
