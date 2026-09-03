import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studentTagOverrides, studentTags, tags } from "@/db/schema";
import {
  applyPostPurchaseTagOverrides,
  POST_PURCHASE_CONTROLLED_TAGS,
  type PostPurchaseControlledTag,
} from "@/lib/post-purchase-entitlements";
import { assignTag, removeTag } from "@/lib/tags";
import { shouldApplyTagChangeAgainstStaffOverride } from "@/lib/tag-override-policy";

export type StaffTagOverride = {
  tagName: string;
  isAssigned: boolean;
};

export async function resolvePostPurchaseTagsWithStaffOverrides(
  userId: string,
  expectedTags: Iterable<PostPurchaseControlledTag>
): Promise<PostPurchaseControlledTag[]> {
  const overrides = await getPostPurchaseStaffTagOverrides(userId);

  return applyPostPurchaseTagOverrides({ expectedTags, overrides });
}

export async function getPostPurchaseStaffTagOverrides(userId: string) {
  const managed = new Set<string>(POST_PURCHASE_CONTROLLED_TAGS);
  const overrides = await getStaffTagOverrides(userId);
  return overrides.filter((override) =>
    managed.has(override.tagName.trim().toLowerCase())
  );
}

/** Return every explicit staff choice for a student, regardless of tag type. */
export async function getStaffTagOverrides(
  userId: string
): Promise<StaffTagOverride[]> {
  return db
    .select({ tagName: tags.name, isAssigned: studentTagOverrides.isAssigned })
    .from(studentTagOverrides)
    .innerJoin(tags, eq(tags.id, studentTagOverrides.tagId))
    .where(eq(studentTagOverrides.userId, userId));
}

/**
 * Automated writers call this before changing a tag. With no staff choice,
 * automation may proceed. Otherwise only the state chosen by staff is allowed.
 */
export async function shouldApplyAutomatedTagChange(params: {
  userId: string;
  tagId: string;
  action: "add" | "remove";
}) {
  const override = await db.query.studentTagOverrides.findFirst({
    where: and(
      eq(studentTagOverrides.userId, params.userId),
      eq(studentTagOverrides.tagId, params.tagId)
    ),
    columns: { isAssigned: true },
  });
  return shouldApplyTagChangeAgainstStaffOverride({
    overrideIsAssigned: override?.isAssigned,
    action: params.action,
  });
}

/**
 * Record and immediately apply a staff decision. The override is written
 * first so an interrupted request is repaired, rather than reverted, by the
 * next reconciliation run.
 */
export async function setStaffTagOverride(params: {
  userId: string;
  tagId: string;
  isAssigned: boolean;
  setBy: string;
}) {
  const tag = await db.query.tags.findFirst({
    where: eq(tags.id, params.tagId),
  });
  if (!tag) throw new Error(`Tag not found: ${params.tagId}`);

  await db
    .insert(studentTagOverrides)
    .values({
      userId: params.userId,
      tagId: params.tagId,
      isAssigned: params.isAssigned,
      setBy: params.setBy,
    })
    .onConflictDoUpdate({
      target: [studentTagOverrides.userId, studentTagOverrides.tagId],
      set: {
        isAssigned: params.isAssigned,
        setBy: params.setBy,
        updatedAt: new Date(),
      },
    });

  if (params.isAssigned) {
    const result = await assignTag(params.userId, params.tagId, params.setBy, {
      source: "api",
    });
    if (!result.assigned) {
      await db
        .update(studentTags)
        .set({ assignedBy: params.setBy, lastModifiedAt: new Date() })
        .where(
          and(
            eq(studentTags.userId, params.userId),
            eq(studentTags.tagId, params.tagId)
          )
        );
    }
    return { changed: result.assigned, tag };
  }

  const result = await removeTag(params.userId, params.tagId, {
    source: "api",
  });
  return { changed: result.removed, tag };
}
