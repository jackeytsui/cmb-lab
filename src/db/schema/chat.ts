import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

// Chat conversations table - chatbot conversation sessions
export const chatConversations = pgTable("chat_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id").references(() => lessons.id, {
    onDelete: "set null",
  }),
  title: text("title"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("chat_conversations_user_id_idx").on(table.userId),
  index("chat_conversations_lesson_id_idx").on(table.lessonId),
]);

// Chat messages table - individual messages in a conversation
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => chatConversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // "user" or "assistant" — plain text, NOT enum (AI SDK uses string roles)
  parts: jsonb("parts").notNull(), // Stores the UIMessage parts array directly
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("chat_messages_conversation_id_idx").on(table.conversationId),
]);

// Relations: ChatConversation belongs to User, optionally to Lesson, has many ChatMessages
export const chatConversationsRelations = relations(
  chatConversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [chatConversations.userId],
      references: [users.id],
    }),
    lesson: one(lessons, {
      fields: [chatConversations.lessonId],
      references: [lessons.id],
    }),
    messages: many(chatMessages),
  })
);

// Relations: ChatMessage belongs to ChatConversation
export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, {
    fields: [chatMessages.conversationId],
    references: [chatConversations.id],
  }),
}));

// Type inference
export type ChatConversation = typeof chatConversations.$inferSelect;
export type NewChatConversation = typeof chatConversations.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
