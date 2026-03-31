import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { studentTags, tagFeatureGrants, tagContentGrants } from "@/db/schema";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/permissions";

type FeatureOverrideState = {
  allow: Set<FeatureKey>;
  deny: Set<FeatureKey>;
};

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

/**
 * Get feature overrides for a user based on their tags.
 *
 * Queries tag_feature_grants table (DB-driven).
 * Each tag can ADD or DENY features. Results are unioned across all user tags.
 * Deny wins if the same feature appears in both allow and deny (from different tags).
 */
export async function getUserFeatureTagOverrides(userId: string): Promise<FeatureOverrideState> {
  const userTagRows = await db
    .select({ tagId: studentTags.tagId })
    .from(studentTags)
    .where(eq(studentTags.userId, userId));

  const allow = new Set<FeatureKey>();
  const deny = new Set<FeatureKey>();

  if (userTagRows.length === 0) return { allow, deny };

  const tagIds = userTagRows.map((r) => r.tagId);

  const grants = await db
    .select({
      featureKey: tagFeatureGrants.featureKey,
      grantType: tagFeatureGrants.grantType,
    })
    .from(tagFeatureGrants)
    .where(inArray(tagFeatureGrants.tagId, tagIds));

  for (const grant of grants) {
    if (!FEATURE_KEY_SET.has(grant.featureKey)) continue;
    const feature = grant.featureKey as FeatureKey;
    if (grant.grantType === "additive") {
      allow.add(feature);
    } else {
      deny.add(feature);
    }
  }

  return { allow, deny };
}

/**
 * Apply feature tag overrides to a base feature set.
 * Removes denied features, adds allowed features.
 */
export function applyFeatureTagOverrides(
  baseFeatures: Iterable<string>,
  overrides: FeatureOverrideState
): Set<string> {
  const next = new Set<string>(baseFeatures);

  for (const denied of overrides.deny) {
    next.delete(denied);
  }

  for (const allowed of overrides.allow) {
    next.add(allowed);
  }

  return next;
}

/**
 * Check if a specific feature is allowed given base permission and tag overrides.
 * Deny takes precedence over allow.
 */
export function hasFeatureWithTagOverrides(
  feature: FeatureKey,
  baseAllowed: boolean,
  overrides: FeatureOverrideState
): boolean {
  if (overrides.deny.has(feature)) return false;
  if (overrides.allow.has(feature)) return true;
  return baseAllowed;
}

/**
 * Get content IDs that a user has access to via tags.
 * Used for audio course series visibility, etc.
 */
export async function getUserContentGrants(
  userId: string,
  contentType: string
): Promise<Set<string>> {
  const rows = await db
    .select({ contentId: tagContentGrants.contentId })
    .from(tagContentGrants)
    .innerJoin(studentTags, eq(tagContentGrants.tagId, studentTags.tagId))
    .where(
      and(
        eq(studentTags.userId, userId),
        eq(tagContentGrants.contentType, contentType)
      )
    );

  return new Set(rows.map((r) => r.contentId));
}

/**
 * Check which content items have ANY tag restrictions.
 * If no rows exist for a content ID, it's unrestricted (visible to all).
 */
export async function getRestrictedContentIds(
  contentType: string
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ contentId: tagContentGrants.contentId })
    .from(tagContentGrants)
    .where(eq(tagContentGrants.contentType, contentType));

  return new Set(rows.map((r) => r.contentId));
}
