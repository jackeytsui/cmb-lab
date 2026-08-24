import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { users, platformRoleFeatures } from "@/db/schema";
import { sql, isNull } from "drizzle-orm";
import {
  PLATFORM_ROLE_DEFINITIONS,
  hasFullFeatureAccess,
} from "@/lib/platform-roles";
import { FEATURE_KEYS } from "@/lib/feature-definitions";

/**
 * GET /api/admin/platform-roles
 * Return every platform role with effective feature access and user counts.
 * Requires coach role.
 */
export async function GET() {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Get user counts grouped by role
    const userCounts = await db
      .select({
        role: users.role,
        count: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(isNull(users.deletedAt))
      .groupBy(users.role);

    const countMap: Record<string, number> = {};
    for (const row of userCounts) {
      countMap[row.role] = row.count;
    }

    // Get all platform role features
    const features = await db
      .select({
        role: platformRoleFeatures.role,
        featureKey: platformRoleFeatures.featureKey,
      })
      .from(platformRoleFeatures);

    const featureMap: Record<string, string[]> = Object.fromEntries(
      PLATFORM_ROLE_DEFINITIONS.map(({ role }) => [role, []]),
    );
    for (const row of features) {
      if (featureMap[row.role]) {
        featureMap[row.role].push(row.featureKey);
      }
    }

    const platformRoles = PLATFORM_ROLE_DEFINITIONS.map((definition) => ({
      role: definition.role,
      label: definition.label,
      description: definition.description,
      userCount: countMap[definition.role] ?? 0,
      features: hasFullFeatureAccess(definition.role)
        ? [...FEATURE_KEYS]
        : featureMap[definition.role],
      featureAccess: definition.featureAccess,
    }));

    return NextResponse.json({ platformRoles });
  } catch (error) {
    console.error("Error fetching platform roles:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform roles" },
      { status: 500 }
    );
  }
}
