import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole, getCurrentUser } from "@/lib/auth";
import { db } from "@/db";
import { aiPrompts, aiPromptVersions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { invalidatePromptCache } from "@/lib/prompts";

/**
 * POST /api/admin/prompts/[promptId]/versions/[versionId]/restore
 * Restore a previous version as a new version.
 * Requires coach role minimum.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ promptId: string; versionId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { promptId, versionId } = await params;

    // Find the version to restore
    const versionToRestore = await db.query.aiPromptVersions.findFirst({
      where: and(
        eq(aiPromptVersions.id, versionId),
        eq(aiPromptVersions.promptId, promptId)
      ),
    });

    if (!versionToRestore) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }

    // Get current prompt for slug and currentVersion
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

    // Transaction: insert new version and update prompt
    await db.transaction(async (tx) => {
      // Insert new version with restored content
      await tx.insert(aiPromptVersions).values({
        promptId,
        version: newVersion,
        content: versionToRestore.content,
        changeNote: `Restored from version ${versionToRestore.version}`,
        createdBy: currentUser?.id || null,
      });

      // Update prompt with restored content and new version
      await tx
        .update(aiPrompts)
        .set({
          currentContent: versionToRestore.content,
          currentVersion: newVersion,
          updatedAt: new Date(),
        })
        .where(eq(aiPrompts.id, promptId));
    });

    // Invalidate cache for this prompt
    invalidatePromptCache(currentPrompt.slug);

    return NextResponse.json({
      success: true,
      version: newVersion,
      restoredFrom: versionToRestore.version,
    });
  } catch (error) {
    console.error("Error restoring version:", error);
    return NextResponse.json(
      { error: "Failed to restore version" },
      { status: 500 }
    );
  }
}
