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
