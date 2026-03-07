import { db } from "@/db";
import {
  chatConversations,
  chatMessages,
  lessons,
  type ChatConversation,
} from "@/db/schema";
import { eq, and, desc, count, sql } from "drizzle-orm";

// ============================================================
// Chat Persistence Helpers
// ============================================================

/**
 * Save (upsert) a chat conversation and its full message array.
 *
 * Uses delete-then-insert for messages because onFinish provides
 * the FULL message array. This avoids complex diff logic and
 * ensures consistency with what the AI SDK has.
 */
export async function saveChat({
  chatId,
  messages,
  userId,
  lessonId,
}: {
  chatId: string;
  messages: Array<{ id: string; role: string; parts: unknown[] }>;
  userId: string;
  lessonId?: string | null;
}): Promise<void> {
  // 1. Upsert the conversation
  await db
    .insert(chatConversations)
    .values({
      id: chatId,
      userId,
      lessonId: lessonId ?? null,
      title: null,
    })
    .onConflictDoUpdate({
      target: chatConversations.id,
      set: { updatedAt: new Date() },
    });

  // 2. Auto-generate title if not set
  const [existing] = await db
    .select({ title: chatConversations.title })
    .from(chatConversations)
    .where(eq(chatConversations.id, chatId))
    .limit(1);

  if (!existing?.title) {
    let title: string | null = null;

    // Try to derive from lesson title if lessonId provided
    if (lessonId) {
      const [lesson] = await db
        .select({ title: lessons.title })
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);
      if (lesson?.title) {
        title = lesson.title.slice(0, 50);
      }
    }

    // Fall back to first user message content
    if (!title) {
      const firstUserMsg = messages.find((m) => m.role === "user");
      if (firstUserMsg && firstUserMsg.parts.length > 0) {
        const firstPart = firstUserMsg.parts[0] as { text?: string };
        if (firstPart?.text) {
          title = firstPart.text.slice(0, 50);
        }
      }
    }

    if (title) {
      await db
        .update(chatConversations)
        .set({ title })
        .where(eq(chatConversations.id, chatId));
    }
  }

  // 3. Delete existing messages for this conversation
  await db
    .delete(chatMessages)
    .where(eq(chatMessages.conversationId, chatId));

  // 4. Insert all messages (only if there are any)
  if (messages.length > 0) {
    await db.insert(chatMessages).values(
      messages.map((m) => ({
        conversationId: chatId,
        role: m.role,
        parts: m.parts,
      }))
    );
  }
}

/**
 * Load a chat conversation and its messages.
 * Returns messages in chronological order (oldest first).
 */
export async function loadChat(chatId: string): Promise<{
  conversation: ChatConversation | null;
  messages: Array<{ role: string; parts: unknown[] }>;
}> {
  // 1. Query conversation
  const [conversation] = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, chatId))
    .limit(1);

  if (!conversation) {
    return { conversation: null, messages: [] };
  }

  // 2. Query messages in chronological order
  const msgs = await db
    .select({
      role: chatMessages.role,
      parts: chatMessages.parts,
    })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, chatId))
    .orderBy(chatMessages.createdAt);

  return {
    conversation,
    messages: msgs.map((m) => ({
      role: m.role,
      parts: m.parts as unknown[],
    })),
  };
}

/**
 * List a user's recent conversations, optionally filtered by lessonId.
 * Returns up to 50 most recent conversations with message counts.
 */
export async function listUserConversations(
  userId: string,
  lessonId?: string | null
): Promise<
  Array<{
    id: string;
    title: string | null;
    lessonId: string | null;
    updatedAt: Date;
    messageCount: number;
  }>
> {
  // Build where clause
  const conditions = [eq(chatConversations.userId, userId)];
  if (lessonId) {
    conditions.push(eq(chatConversations.lessonId, lessonId));
  }

  // Query conversations with message count via subquery
  const messageCountSq = db
    .select({
      conversationId: chatMessages.conversationId,
      count: count().as("msg_count"),
    })
    .from(chatMessages)
    .groupBy(chatMessages.conversationId)
    .as("msg_counts");

  const results = await db
    .select({
      id: chatConversations.id,
      title: chatConversations.title,
      lessonId: chatConversations.lessonId,
      updatedAt: chatConversations.updatedAt,
      messageCount: sql<number>`coalesce(${messageCountSq.count}, 0)`,
    })
    .from(chatConversations)
    .leftJoin(
      messageCountSq,
      eq(chatConversations.id, messageCountSq.conversationId)
    )
    .where(and(...conditions))
    .orderBy(desc(chatConversations.updatedAt))
    .limit(50);

  return results.map((r) => ({
    id: r.id,
    title: r.title,
    lessonId: r.lessonId,
    updatedAt: r.updatedAt,
    messageCount: Number(r.messageCount),
  }));
}
