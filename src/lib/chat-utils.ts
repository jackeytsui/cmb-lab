import { db } from "@/db";
import { kbChunks, kbEntries } from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";

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
 * Search the knowledge base for content matching the query.
 * Used server-side by the chat API RAG tool — queries the database directly
 * rather than calling the HTTP search endpoint.
 *
 * @param query - Search query string
 * @returns Formatted string of matching KB results, or a "no results" message
 */
export async function searchKnowledgeBase(query: string): Promise<string> {
  try {
    const sanitized = sanitizeQuery(query);
    if (sanitized.length < 2) {
      return "No relevant information found in knowledge base.";
    }

    const pattern = `%${sanitized}%`;

    let results = await db
      .select({
        entryTitle: kbEntries.title,
        chunkContent: kbChunks.content,
      })
      .from(kbChunks)
      .innerJoin(kbEntries, eq(kbChunks.entryId, kbEntries.id))
      .where(
        and(
          or(ilike(kbEntries.title, pattern), ilike(kbChunks.content, pattern)),
          eq(kbEntries.status, "published")
        )
      )
      .limit(5);

    // Natural student questions rarely appear verbatim in an article. If the
    // phrase does not match, retry with a small set of meaningful keywords so
    // "where is my assigned custom course?" can retrieve "assigned courses".
    if (results.length === 0) {
      const terms = Array.from(
        new Set(
          sanitized
            .split(/\s+/)
            .map((term) => term.replace(/[^\p{L}\p{N}-]/gu, ""))
            .filter((term) => term.length >= 4)
        )
      ).slice(0, 6);

      if (terms.length > 0) {
        const keywordMatches = terms.flatMap((term) => {
          const keywordPattern = `%${term}%`;
          return [
            ilike(kbEntries.title, keywordPattern),
            ilike(kbChunks.content, keywordPattern),
          ];
        });

        results = await db
          .select({
            entryTitle: kbEntries.title,
            chunkContent: kbChunks.content,
          })
          .from(kbChunks)
          .innerJoin(kbEntries, eq(kbChunks.entryId, kbEntries.id))
          .where(
            and(or(...keywordMatches), eq(kbEntries.status, "published"))
          )
          .limit(5);
      }
    }

    if (results.length === 0) {
      return "No relevant information found in knowledge base.";
    }

    return results
      .map((r) => `[${r.entryTitle}]: ${r.chunkContent}`)
      .join("\n\n");
  } catch (error) {
    console.error("KB search error in chat:", error);
    return "No relevant information found in knowledge base.";
  }
}
