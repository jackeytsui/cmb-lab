import { NextRequest, NextResponse } from "next/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { aiPromptVersions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

/**
 * GET /api/admin/prompts/[promptId]/versions
 * Get version history for a prompt.
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

    // Get all versions for this prompt with creator info
    const versions = await db.query.aiPromptVersions.findMany({
      where: eq(aiPromptVersions.promptId, promptId),
      with: {
        createdByUser: {
          columns: { id: true, name: true, email: true },
        },
      },
      orderBy: [desc(aiPromptVersions.version)],
    });

    // Map to response format with content preview
    const versionList = versions.map((v) => ({
      id: v.id,
      version: v.version,
      content: v.content.length > 200 ? v.content.substring(0, 200) + "..." : v.content,
      fullContent: v.content,
      changeNote: v.changeNote,
      createdAt: v.createdAt,
      createdBy: v.createdByUser?.name || v.createdByUser?.email || "System",
    }));

    return NextResponse.json({ versions: versionList });
  } catch (error) {
    console.error("Error fetching versions:", error);
    return NextResponse.json(
      { error: "Failed to fetch versions" },
      { status: 500 }
    );
  }
}
