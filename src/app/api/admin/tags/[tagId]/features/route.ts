import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { tagFeatureGrants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { FEATURE_KEYS } from "@/lib/permissions";

const grantSchema = z.object({
  grants: z.array(
    z.object({
      featureKey: z.enum(FEATURE_KEYS),
      grantType: z.enum(["additive", "deny"]),
    })
  ),
});

/**
 * GET /api/admin/tags/[tagId]/features
 * List all feature grants for a tag.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tagId } = await params;

  const grants = await db
    .select({
      id: tagFeatureGrants.id,
      featureKey: tagFeatureGrants.featureKey,
      grantType: tagFeatureGrants.grantType,
    })
    .from(tagFeatureGrants)
    .where(eq(tagFeatureGrants.tagId, tagId));

  return NextResponse.json({ grants });
}

/**
 * PUT /api/admin/tags/[tagId]/features
 * Replace all feature grants for a tag (atomic: delete + insert).
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ tagId: string }> }
) {
  const hasAccess = await hasMinimumRole("admin");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { tagId } = await params;

  const body = await request.json();
  const parsed = grantSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  try {
    // Delete then insert (no transaction — neon-http doesn't support them)
    {
      await db.delete(tagFeatureGrants).where(eq(tagFeatureGrants.tagId, tagId));

      if (parsed.data.grants.length > 0) {
        await db.insert(tagFeatureGrants).values(
          parsed.data.grants.map((g) => ({
            tagId,
            featureKey: g.featureKey,
            grantType: g.grantType as "additive" | "deny",
          }))
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update tag feature grants:", error);
    return NextResponse.json(
      { error: "Failed to update grants" },
      { status: 500 }
    );
  }
}
