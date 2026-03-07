import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { createTag, getTags } from "@/lib/tags";
import { getCurrentUser } from "@/lib/auth";
import { z } from "zod";

const createTagSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a valid hex color"),
  type: z.enum(["coach", "system"]).optional(),
  description: z.string().optional(),
});

/**
 * GET /api/admin/tags
 * List all tags. Accepts optional ?type=coach|system query param.
 * Requires coach role.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as "coach" | "system" | null;

    const allTags = await getTags(type ? { type } : undefined);
    return NextResponse.json({ tags: allTags });
  } catch (error) {
    console.error("Error fetching tags:", error);
    return NextResponse.json(
      { error: "Failed to fetch tags" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/tags
 * Create a new tag.
 * Requires coach role.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const parsed = createTagSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const currentUser = await getCurrentUser();
    const tag = await createTag({
      ...parsed.data,
      createdBy: currentUser?.id,
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    console.error("Error creating tag:", error);
    return NextResponse.json(
      { error: "Failed to create tag" },
      { status: 500 }
    );
  }
}
