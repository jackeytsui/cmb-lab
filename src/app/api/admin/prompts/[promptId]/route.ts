import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { invalidatePromptCache } from "@/lib/prompts";
import { savePromptVersion } from "@/lib/prompt-versioning";

/**
 * GET /api/admin/prompts/[promptId]
 * Get a single prompt with full content.
 * Requires coach role minimum.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { promptId } = await params;

    const prompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.id, promptId),
    });

    if (!prompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    return NextResponse.json({ prompt });
  } catch (error) {
    console.error("Error fetching prompt:", error);
    return NextResponse.json(
      { error: "Failed to fetch prompt" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/prompts/[promptId]
 * Update prompt content and create new version.
 * Requires coach role minimum.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { promptId } = await params;
    const body = await request.json();
    const { content, changeNote } = body;

    // Validate content
    if (!content || typeof content !== "string" || content.trim().length === 0) {
      return NextResponse.json(
        { error: "Content is required and must be non-empty" },
        { status: 400 }
      );
    }

    // Get current prompt
    const currentPrompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.id, promptId),
      columns: { id: true, slug: true, currentVersion: true },
    });

    if (!currentPrompt) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    // Get current user for createdBy
    const currentUser = await getCurrentUser();
    const newVersion = currentPrompt.currentVersion + 1;

    await savePromptVersion({
      promptId,
      version: newVersion,
      content: content.trim(),
      changeNote: changeNote?.trim() || null,
      createdBy: currentUser?.id || null,
    });

    // Invalidate cache for this prompt
    invalidatePromptCache(currentPrompt.slug);

    return NextResponse.json({ success: true, version: newVersion });
  } catch (error) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { error: "Failed to update prompt" },
      { status: 500 }
    );
  }
}
