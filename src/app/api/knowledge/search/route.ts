import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { kbChunks, kbEntries, kbCategories } from "@/db/schema";
import { and, eq, ilike, sql } from "drizzle-orm";

/**
 * Sanitize search query for safe use in SQL ilike patterns.
 * Escapes % and _ which are SQL wildcard characters.
 */
function sanitizeQuery(query: string): string {
  return query
    .trim()
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * GET /api/knowledge/search?q=keyword&limit=10&categoryId=uuid
 *
 * Search knowledge base entries by keyword matching across chunks and entries.
 * Returns results grouped by entry with matching chunk previews, ordered by relevance.
 *
 * Authentication: Requires authenticated user (not role-specific, as chatbot will also use this).
 */
export async function GET(request: NextRequest) {
  // Require authentication
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawQuery = searchParams.get("q");
    const limitParam = searchParams.get("limit");
    const categoryId = searchParams.get("categoryId");

    // Validate query
    if (!rawQuery || rawQuery.trim().length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters" },
        { status: 400 }
      );
    }

    // Parse and clamp limit
    const limit = Math.min(Math.max(parseInt(limitParam || "10", 10) || 10, 1), 50);

    const sanitized = sanitizeQuery(rawQuery);
    const pattern = `%${sanitized}%`;

    // Search chunks for matching content
    const chunkFilters = [
      ilike(kbChunks.content, pattern),
      eq(kbEntries.status, "published"),
    ];
    if (categoryId) {
      chunkFilters.push(eq(kbEntries.categoryId, categoryId));
    }

    const chunkResults = await db
      .select({
        chunkId: kbChunks.id,
        chunkContent: kbChunks.content,
        chunkIndex: kbChunks.chunkIndex,
        entryId: kbEntries.id,
        entryTitle: kbEntries.title,
        categoryName: kbCategories.name,
      })
      .from(kbChunks)
      .innerJoin(kbEntries, eq(kbChunks.entryId, kbEntries.id))
      .leftJoin(kbCategories, eq(kbEntries.categoryId, kbCategories.id))
      .where(and(...chunkFilters));

    // Also search entry titles and content directly
    const entryFilters = [
      eq(kbEntries.status, "published"),
      sql`(${ilike(kbEntries.title, pattern)} OR ${ilike(kbEntries.content, pattern)})`,
    ];
    if (categoryId) {
      entryFilters.push(eq(kbEntries.categoryId, categoryId));
    }

    const entryResults = await db
      .select({
        entryId: kbEntries.id,
        entryTitle: kbEntries.title,
        categoryName: kbCategories.name,
      })
      .from(kbEntries)
      .leftJoin(kbCategories, eq(kbEntries.categoryId, kbCategories.id))
      .where(and(...entryFilters));

    // Group and deduplicate results by entryId
    const resultsMap = new Map<
      string,
      {
        entryId: string;
        entryTitle: string;
        categoryName: string | null;
        matchingChunks: { chunkId: string; content: string; chunkIndex: number }[];
      }
    >();

    // Add chunk-matched results
    for (const row of chunkResults) {
      const existing = resultsMap.get(row.entryId);
      if (existing) {
        existing.matchingChunks.push({
          chunkId: row.chunkId,
          content: row.chunkContent,
          chunkIndex: row.chunkIndex,
        });
      } else {
        resultsMap.set(row.entryId, {
          entryId: row.entryId,
          entryTitle: row.entryTitle,
          categoryName: row.categoryName,
          matchingChunks: [
            {
              chunkId: row.chunkId,
              content: row.chunkContent,
              chunkIndex: row.chunkIndex,
            },
          ],
        });
      }
    }

    // Add entry-matched results (ensure they appear even without chunk matches)
    for (const row of entryResults) {
      if (!resultsMap.has(row.entryId)) {
        resultsMap.set(row.entryId, {
          entryId: row.entryId,
          entryTitle: row.entryTitle,
          categoryName: row.categoryName,
          matchingChunks: [],
        });
      }
    }

    // Sort by match count descending (most relevant first) and apply limit
    const results = Array.from(resultsMap.values())
      .map((entry) => ({
        ...entry,
        matchCount: entry.matchingChunks.length,
      }))
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, limit);

    return NextResponse.json({
      results,
      query: rawQuery.trim(),
      totalResults: results.length,
    });
  } catch (error) {
    console.error("Knowledge base search error:", error);
    return NextResponse.json(
      { error: "Failed to search knowledge base" },
      { status: 500 }
    );
  }
}
