import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { platformRoleFeatures } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { featureKeySchema } from "@/lib/permissions";
import {
  hasFullFeatureAccess,
  normalizePlatformRole,
} from "@/lib/platform-roles";
import { FEATURE_KEYS } from "@/lib/feature-definitions";

const toggleSchema = z.object({
  featureKey: featureKeySchema,
  enabled: z.boolean(),
});

/**
 * GET /api/admin/platform-roles/:roleName/features
 * Return features for a specific platform role.
 * Requires coach role.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleName } = await params;

    const platformRole = normalizePlatformRole(roleName);
    if (!platformRole) {
      return NextResponse.json(
        { error: "Invalid platform role" },
        { status: 400 }
      );
    }

    if (hasFullFeatureAccess(platformRole)) {
      return NextResponse.json({ features: [...FEATURE_KEYS] });
    }

    const features = await db
      .select({ featureKey: platformRoleFeatures.featureKey })
      .from(platformRoleFeatures)
      .where(eq(platformRoleFeatures.role, platformRole));

    return NextResponse.json({
      features: features.map((f) => f.featureKey),
    });
  } catch (error) {
    console.error("Error fetching platform role features:", error);
    return NextResponse.json(
      { error: "Failed to fetch platform role features" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/platform-roles/:roleName/features
 * Toggle a feature for a platform role.
 * Full-access role features are not modifiable (return 400).
 * Requires coach role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleName: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleName } = await params;

    const platformRole = normalizePlatformRole(roleName);
    if (!platformRole) {
      return NextResponse.json(
        { error: "Invalid platform role" },
        { status: 400 }
      );
    }

    if (hasFullFeatureAccess(platformRole)) {
      return NextResponse.json(
        {
          error: `${platformRole === "admin" ? "Admin" : "Coach"} feature access is locked because this role has all features.`,
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const parsed = toggleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { featureKey, enabled } = parsed.data;

    if (enabled) {
      await db
        .insert(platformRoleFeatures)
        .values({ role: platformRole, featureKey })
        .onConflictDoNothing();
    } else {
      await db
        .delete(platformRoleFeatures)
        .where(
          and(
            eq(platformRoleFeatures.role, platformRole),
            eq(platformRoleFeatures.featureKey, featureKey)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating platform role features:", error);
    return NextResponse.json(
      { error: "Failed to update platform role features" },
      { status: 500 }
    );
  }
}
