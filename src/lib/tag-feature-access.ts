import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { studentTags, tags } from "@/db/schema";
import { FEATURE_KEYS, type FeatureKey } from "@/lib/permissions";

type FeatureOverrideState = {
  allow: Set<FeatureKey>;
  deny: Set<FeatureKey>;
};

const FEATURE_KEY_SET = new Set<string>(FEATURE_KEYS);

/**
 * Exclusive tag mappings: when a student has one of these tags,
 * they get ONLY the listed features (all others are denied).
 * This replaces the student's default feature set entirely.
 */
// Keys are stored lowercase for case-insensitive matching
const EXCLUSIVE_TAG_MAP: Record<string, FeatureKey[]> = {
  lto_student: ["mandarin_accelerator"],
};

function parseFeatureTag(tagName: string): { mode: "allow" | "deny"; feature: FeatureKey } | null {
  const normalized = tagName.trim().toLowerCase();
  const match = normalized.match(/^feature:(enable|disable):([a-z_]+)$/);
  if (!match) return null;

  const mode = match[1] === "enable" ? "allow" : "deny";
  const feature = match[2];
  if (!FEATURE_KEY_SET.has(feature)) return null;

  return { mode, feature: feature as FeatureKey };
}

export async function getUserFeatureTagOverrides(userId: string): Promise<FeatureOverrideState> {
  const rows = await db
    .select({ name: tags.name })
    .from(studentTags)
    .innerJoin(tags, eq(studentTags.tagId, tags.id))
    .where(and(eq(studentTags.userId, userId)));

  const allow = new Set<FeatureKey>();
  const deny = new Set<FeatureKey>();

  for (const row of rows) {
    // Check exclusive tag mappings first (case-insensitive)
    const exclusiveFeatures = EXCLUSIVE_TAG_MAP[row.name.trim().toLowerCase()];
    if (exclusiveFeatures) {
      // Deny all features, then allow only the mapped ones
      for (const key of FEATURE_KEYS) {
        if (!exclusiveFeatures.includes(key)) {
          deny.add(key);
        }
      }
      for (const feature of exclusiveFeatures) {
        allow.add(feature);
      }
      continue;
    }

    // Standard feature:enable/disable convention
    const parsed = parseFeatureTag(row.name);
    if (!parsed) continue;
    if (parsed.mode === "allow") {
      allow.add(parsed.feature);
    } else {
      deny.add(parsed.feature);
    }
  }

  return { allow, deny };
}

export function applyFeatureTagOverrides(baseFeatures: Iterable<string>, overrides: FeatureOverrideState): Set<string> {
  const next = new Set<string>(baseFeatures);

  for (const denied of overrides.deny) {
    next.delete(denied);
  }

  for (const allowed of overrides.allow) {
    next.add(allowed);
  }

  return next;
}

export function hasFeatureWithTagOverrides(
  feature: FeatureKey,
  baseAllowed: boolean,
  overrides: FeatureOverrideState
): boolean {
  if (overrides.deny.has(feature)) return false;
  if (overrides.allow.has(feature)) return true;
  return baseAllowed;
}
