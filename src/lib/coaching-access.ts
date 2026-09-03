import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { tagFeatureGrants, tags } from "@/db/schema";

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
          type: "coach",
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
