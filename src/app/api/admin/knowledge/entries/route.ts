import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasMinimumRole } from "@/lib/auth";
import { db } from "@/db";
import { kbEntries, kbCategories, kbChunks } from "@/db/schema";
import { and, desc, eq, ilike, or } from "drizzle-orm";

/**
 * GET /api/admin/knowledge/entries
 * List knowledge base entries with optional filters.
 * Supports ?categoryId=uuid&status=published&search=keyword
 * Requires coach role minimum.
 */
export async function GET(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    const status = searchParams.get("status") as
      | "draft"
      | "published"
      | null;
    const search = searchParams.get("search");

    // Build where conditions
    const conditions = [];
    if (categoryId) {
      conditions.push(eq(kbEntries.categoryId, categoryId));
    }
    if (status) {
      conditions.push(eq(kbEntries.status, status));
    }
    if (search) {
      conditions.push(
        or(
          ilike(kbEntries.title, `%${search}%`),
          ilike(kbEntries.content, `%${search}%`)
        )!
      );
    }

    const whereClause =
      conditions.length > 0 ? and(...conditions) : undefined;

    // Query entries with category name via left join
    const entries = await db
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
      .where(whereClause)
      .orderBy(desc(kbEntries.updatedAt));

    return NextResponse.json({ entries });
  } catch (error) {
    console.error("Error fetching entries:", error);
    return NextResponse.json(
      { error: "Failed to fetch entries" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/knowledge/entries
 * Create a new knowledge base entry with auto-chunking.
 * Splits content by paragraphs and creates kbChunks records.
 * Requires coach role minimum.
 */
export async function POST(request: NextRequest) {
  const hasAccess = await hasMinimumRole("coach");
  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, content, categoryId, status } = body;

    // Validate required fields
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }
    if (
      !content ||
      typeof content !== "string" ||
      content.trim().length === 0
    ) {
      return NextResponse.json(
        { error: "Content is required" },
        { status: 400 }
      );
    }

    // Insert entry
    const [entry] = await db
      .insert(kbEntries)
      .values({
        title: title.trim(),
        content: content.trim(),
        categoryId: categoryId || null,
        status: status || "published",
        createdBy: userId,
      })
      .returning();

    // Auto-chunk content by splitting on double newlines
    const paragraphs = content
      .split(/\n\s*\n/)
      .map((p: string) => p.trim())
      .filter((p: string) => p.length > 0);

    let chunkCount = 0;
    if (paragraphs.length > 0) {
      const chunksToInsert = paragraphs.map(
        (paragraph: string, index: number) => ({
          entryId: entry.id,
          fileSourceId: null,
          content: paragraph,
          chunkIndex: index,
        })
      );

      await db.insert(kbChunks).values(chunksToInsert);
      chunkCount = chunksToInsert.length;
    }

    return NextResponse.json({ entry, chunkCount }, { status: 201 });
  } catch (error) {
    console.error("Error creating entry:", error);
    return NextResponse.json(
      { error: "Failed to create entry" },
      { status: 500 }
    );
  }
}
