import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { studentTags, tags, tagFeatureGrants, tagContentGrants } from "@/db/schema";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/permissions";

type FeatureOverrideState = {
  allow: Set<FeatureKey>;
  deny: Set<FeatureKey>;
};

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

/**
 * Classic LTO students (users with the `LTO_student` system tag) are an
 * exclusive cohort that should only see Mandarin Accelerator content. These
 * features are hard-denied in code so the deny takes effect even if the
 * per-tag DB grants aren't configured.
 */
export const LTO_STUDENT_TAG_NAME = "LTO_student";

const LTO_DENIED_FEATURES: readonly FeatureKey[] = [
  "ai_conversation",
  "practice_sets",
  "dictionary_reader",
  "audio_courses",
  "listening_lab",
  "coaching_material",
  "flashcards",
  "course_library",
  "video_threads",
  "certificates",
  "ai_chat",
];

/**
 * Get feature overrides for a user based on their tags.
 *
 * Queries tag_feature_grants table (DB-driven).
 * Each tag can ADD or DENY features. Results are unioned across all user tags.
 * Deny wins if the same feature appears in both allow and deny (from different tags).
 */
export async function getUserFeatureTagOverrides(userId: string): Promise<FeatureOverrideState> {
  const userTagRows = await db
    .select({ tagId: studentTags.tagId, tagName: tags.name })
    .from(studentTags)
    .innerJoin(tags, eq(studentTags.tagId, tags.id))
    .where(eq(studentTags.userId, userId));

  const allow = new Set<FeatureKey>();
  const deny = new Set<FeatureKey>();

  if (userTagRows.length === 0) return { allow, deny };

  const hasLtoTag = userTagRows.some((r) => r.tagName === LTO_STUDENT_TAG_NAME);
  if (hasLtoTag) {
    for (const f of LTO_DENIED_FEATURES) deny.add(f);
  }

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
 * True if the user has the `LTO_student` system tag. Used to gate
 * regular-student routes that don't correspond to a single feature key.
 */
export async function userHasLtoStudentTag(userId: string): Promise<boolean> {
  const row = await db
    .select({ id: studentTags.tagId })
    .from(studentTags)
    .innerJoin(tags, eq(studentTags.tagId, tags.id))
    .where(and(eq(studentTags.userId, userId), eq(tags.name, LTO_STUDENT_TAG_NAME)))
    .limit(1);
  return row.length > 0;
}

/**
 * Apply feature tag overrides to a base feature set.
 * Adds allowed features, then removes denied features.
 * Deny ALWAYS wins over allow (matches hasFeatureWithTagOverrides semantics).
 */
export function applyFeatureTagOverrides(
  baseFeatures: Iterable<string>,
  overrides: FeatureOverrideState
): Set<string> {
  const next = new Set<string>(baseFeatures);

  // Apply allow first so deny can override conflicting grants from other tags
  for (const allowed of overrides.allow) {
    next.add(allowed);
  }

  for (const denied of overrides.deny) {
    next.delete(denied);
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
