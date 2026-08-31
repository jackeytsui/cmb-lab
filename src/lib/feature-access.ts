import "server-only";
import { resolvePermissions, type FeatureKey } from "@/lib/permissions";
import {
  getUserFeatureTagOverrides,
  hasFeatureWithTagOverrides,
} from "@/lib/tag-feature-access";
import { hasFullFeatureAccess, isFeatureDisabledForRole } from "@/lib/platform-roles";

/**
 * Authoritative feature entitlement check shared by pages and API routes.
 * Explicit role exclusions precede staff package bypasses. Role grants and tag
 * overrides are resolved together, with tag denies taking precedence.
 * Callers must supply the persisted role, not just an ID or a client claim.
 */
export async function userCanUseFeature(
  user: { id: string; role: string },
  feature: FeatureKey,
): Promise<boolean> {
  if (!user.role) return false;
  if (isFeatureDisabledForRole(user.role, feature)) return false;
  if (hasFullFeatureAccess(user.role)) return true;

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
