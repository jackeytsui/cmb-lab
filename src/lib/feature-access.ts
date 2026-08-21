import "server-only";
import { resolvePermissions, type FeatureKey } from "@/lib/permissions";
import {
  getUserFeatureTagOverrides,
  hasFeatureWithTagOverrides,
} from "@/lib/tag-feature-access";

/**
 * Authoritative feature entitlement check shared by pages and API routes.
 * Staff bypass package gates; student role grants and tag overrides are
 * resolved together, with tag denies taking precedence.
 */
export async function userCanUseFeature(
  user: { id: string; role?: string | null },
  feature: FeatureKey,
): Promise<boolean> {
  if (user.role === "coach" || user.role === "admin") return true;

  const [permissions, overrides] = await Promise.all([
    resolvePermissions(user.id),
    getUserFeatureTagOverrides(user.id),
  ]);

  const forcedStudent = process.env.FORCE_STUDENT_MODE === "true";
  const forcedAllowed =
    forcedStudent &&
    (feature === "dictionary_reader" ||
      feature === "listening_lab" ||
      feature === "coaching_material");

  return hasFeatureWithTagOverrides(
    feature,
    forcedAllowed || permissions.canUseFeature(feature),
    overrides,
  );
}
