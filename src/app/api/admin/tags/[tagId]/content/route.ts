import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { tagContentGrants } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const grantSchema = z.object({
  grants: z.array(
    z.object({
      contentType: z.string().min(1),
      contentId: z.string().uuid(),
    })
  ),
});

/**
 * GET /api/admin/tags/[tagId]/content
 * List all content grants for a tag.
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
      id: tagContentGrants.id,
      contentType: tagContentGrants.contentType,
      contentId: tagContentGrants.contentId,
    })
    .from(tagContentGrants)
    .where(eq(tagContentGrants.tagId, tagId));

  return NextResponse.json({ grants });
}

/**
 * PUT /api/admin/tags/[tagId]/content
 * Replace all content grants for a tag (atomic: delete + insert).
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
    await db.delete(tagContentGrants).where(eq(tagContentGrants.tagId, tagId));

    if (parsed.data.grants.length > 0) {
      await db.insert(tagContentGrants).values(
        parsed.data.grants.map((g) => ({
          tagId,
          contentType: g.contentType,
          contentId: g.contentId,
        }))
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to update tag content grants:", error);
    return NextResponse.json(
      { error: "Failed to update grants" },
      { status: 500 }
    );
  }
}
