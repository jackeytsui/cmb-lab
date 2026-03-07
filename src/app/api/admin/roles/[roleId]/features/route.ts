import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { roleFeatures } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { featureKeySchema } from "@/lib/permissions";

const schema = z.object({
  featureKey: featureKeySchema,
  enabled: z.boolean(),
});

/**
 * PUT /api/admin/roles/:roleId/features
 * Enable or disable a feature flag for a role.
 * Requires coach role.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ roleId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { roleId } = await params;
    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { featureKey, enabled } = parsed.data;

    if (enabled) {
      // Insert with ON CONFLICT DO NOTHING (idempotent enable)
      await db
        .insert(roleFeatures)
        .values({ roleId, featureKey })
        .onConflictDoNothing();
    } else {
      // Delete the feature grant
      await db
        .delete(roleFeatures)
        .where(
          and(
            eq(roleFeatures.roleId, roleId),
            eq(roleFeatures.featureKey, featureKey)
          )
        );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating role features:", error);
    return NextResponse.json(
      { error: "Failed to update role features" },
      { status: 500 }
    );
  }
}
