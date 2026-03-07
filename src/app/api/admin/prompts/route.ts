import { NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { asc } from "drizzle-orm";

/**
 * GET /api/admin/prompts
 * List all AI prompts with type labels.
 * Requires coach role minimum.
 */
export async function GET() {
  // Verify coach role minimum
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Get all prompts ordered by name
    const promptList = await db
      .select({
        id: aiPrompts.id,
        slug: aiPrompts.slug,
        name: aiPrompts.name,
        type: aiPrompts.type,
        description: aiPrompts.description,
        currentVersion: aiPrompts.currentVersion,
        updatedAt: aiPrompts.updatedAt,
      })
      .from(aiPrompts)
      .orderBy(asc(aiPrompts.name));

    return NextResponse.json({ prompts: promptList });
  } catch (error) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompts" },
      { status: 500 }
    );
  }
}
