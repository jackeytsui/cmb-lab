import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

// Turn role enum (user = student speaking, assistant = AI speaking)
export const turnRoleEnum = pgEnum("turn_role", ["user", "assistant"]);

// Conversations table - voice conversation sessions
export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"), // Set when conversation ends
  durationSeconds: integer("duration_seconds"), // Calculated on end
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("conversations_user_id_idx").on(table.userId),
  index("conversations_lesson_id_idx").on(table.lessonId),
]);

// Conversation turns table - individual speech turns in a conversation
export const conversationTurns = pgTable("conversation_turns", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: turnRoleEnum("role").notNull(),
  content: text("content").notNull(), // Transcribed text
  audioUrl: text("audio_url"), // For future audio storage
  timestamp: integer("timestamp").notNull(), // Seconds from conversation start
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("conversation_turns_conversation_id_idx").on(table.conversationId),
]);

// Relations: Conversation belongs to User and Lesson
export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [conversations.lessonId],
    references: [lessons.id],
  }),
  turns: many(conversationTurns),
}));

// Relations: Turn belongs to Conversation
export const conversationTurnsRelations = relations(conversationTurns, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTurns.conversationId],
    references: [conversations.id],
  }),
}));

// Type inference
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type ConversationTurn = typeof conversationTurns.$inferSelect;
export type NewConversationTurn = typeof conversationTurns.$inferInsert;
