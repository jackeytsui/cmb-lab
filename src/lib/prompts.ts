import { db } from "@/db";
import { aiPrompts } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * In-memory cache for prompt content
 * Key: prompt slug
 * Value: { content: string, expires: timestamp }
 */
const promptCache = new Map<string, { content: string; expires: number }>();
const CACHE_TTL = 60 * 1000; // 1 minute

/**
 * Get prompt content by slug with caching.
 * Falls back to defaultContent if prompt not found or on error.
 *
 * @param slug - The prompt identifier (e.g., "voice-tutor-system")
 * @param defaultContent - Fallback content if prompt not found
 * @returns The prompt content or default
 */
export async function getPrompt(
  slug: string,
  defaultContent: string
): Promise<string> {
  // Check cache first
  const cached = promptCache.get(slug);
  if (cached && cached.expires > Date.now()) {
    return cached.content;
  }

  try {
    // Query database for prompt content
    const prompt = await db.query.aiPrompts.findFirst({
      where: eq(aiPrompts.slug, slug),
      columns: { currentContent: true },
    });

    if (prompt) {
      // Cache the result
      promptCache.set(slug, {
        content: prompt.currentContent,
        expires: Date.now() + CACHE_TTL,
      });
      return prompt.currentContent;
    }

    // Prompt not found, return default
    return defaultContent;
  } catch (error) {
    // Log error but don't throw - graceful degradation
    console.error(`Error loading prompt "${slug}":`, error);
    return defaultContent;
  }
}

/**
 * Invalidate cache for a specific prompt slug.
 * Call this after updating a prompt.
 *
 * @param slug - The prompt identifier to invalidate
 */
export function invalidatePromptCache(slug: string): void {
  promptCache.delete(slug);
}

/**
 * Clear entire prompt cache.
 * Useful for debugging or testing.
 */
export function invalidateAllPromptCache(): void {
  promptCache.clear();
}
