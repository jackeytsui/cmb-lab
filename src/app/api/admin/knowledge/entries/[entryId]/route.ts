import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import {
  kbEntries,
  kbCategories,
  kbChunks,
  kbFileSources,
} from "@/db/schema";
import { and, count, eq, isNull } from "drizzle-orm";

/**
 * GET /api/admin/knowledge/entries/[entryId]
 * Get a single entry with category name, chunk count, and file source count.
 * Requires coach role minimum.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { entryId } = await params;

    // Get entry with category name
    const [entryRow] = await db
      .select({
        id: kbEntries.id,
        title: kbEntries.title,
        content: kbEntries.content,
        categoryId: kbEntries.categoryId,
        categoryName: kbCategories.name,
        status: kbEntries.status,
        createdBy: kbEntries.createdBy,
        updatedBy: kbEntries.updatedBy,
        createdAt: kbEntries.createdAt,
        updatedAt: kbEntries.updatedAt,
      })
      .from(kbEntries)
      .leftJoin(kbCategories, eq(kbEntries.categoryId, kbCategories.id))
      .where(eq(kbEntries.id, entryId));

    if (!entryRow) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    // Get chunk count
    const [chunkResult] = await db
      .select({ value: count() })
      .from(kbChunks)
      .where(eq(kbChunks.entryId, entryId));

    // Get file source count
    const [fileSourceResult] = await db
      .select({ value: count() })
      .from(kbFileSources)
      .where(eq(kbFileSources.entryId, entryId));

    return NextResponse.json({
      entry: {
        ...entryRow,
        chunkCount: chunkResult?.value ?? 0,
        fileSourceCount: fileSourceResult?.value ?? 0,
      },
    });
  } catch (error) {
    console.error("Error fetching entry:", error);
    return NextResponse.json(
      { error: "Failed to fetch entry" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/knowledge/entries/[entryId]
 * Update a knowledge base entry.
 * If content changes, re-chunks manual chunks (fileSourceId is null).
 * Requires coach role minimum.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { entryId } = await params;
    const { userId } = await auth();

    const body = await request.json();
    const { title, content, categoryId, status } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content.trim();
    if (categoryId !== undefined) updates.categoryId = categoryId || null;
    if (status !== undefined) updates.status = status;
    updates.updatedBy = userId || null;
    updates.updatedAt = new Date();

    const [entry] = await db
      .update(kbEntries)
      .set(updates)
      .where(eq(kbEntries.id, entryId))
      .returning();

    if (!entry) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    // If content was updated, re-chunk manual chunks
    if (content !== undefined) {
      // Delete existing manual chunks (fileSourceId is null)
      await db
        .delete(kbChunks)
        .where(
          and(
            eq(kbChunks.entryId, entryId),
            isNull(kbChunks.fileSourceId)
          )
        );

      // Re-chunk the new content
      const paragraphs = content
        .split(/\n\s*\n/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      if (paragraphs.length > 0) {
        const chunksToInsert = paragraphs.map(
          (paragraph: string, index: number) => ({
            entryId,
            fileSourceId: null,
            content: paragraph,
            chunkIndex: index,
          })
        );

        await db.insert(kbChunks).values(chunksToInsert);
      }
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Error updating entry:", error);
    return NextResponse.json(
      { error: "Failed to update entry" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/knowledge/entries/[entryId]
 * Delete a knowledge base entry.
 * Cascade deletes chunks and file sources automatically (DB constraint).
 * Requires coach role minimum.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> }
) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { entryId } = await params;

    const [deleted] = await db
      .delete(kbEntries)
      .where(eq(kbEntries.id, entryId))
      .returning({ id: kbEntries.id });

    if (!deleted) {
      return NextResponse.json(
        { error: "Entry not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting entry:", error);
    return NextResponse.json(
      { error: "Failed to delete entry" },
      { status: 500 }
    );
  }
}
