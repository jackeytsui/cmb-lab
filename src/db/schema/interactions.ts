import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { lessons } from "./courses";
import { users } from "./users";
import { videoPrompts } from "./video-prompts";

// Interaction type enum
export const interactionTypeEnum = pgEnum("interaction_type", ["text", "audio", "video"]);

// Interaction language enum (which language this interaction tests)
export const interactionLanguageEnum = pgEnum("interaction_language", [
  "cantonese",
  "mandarin",
  "both",
]);

// Interactions table - defines pause points in lessons
export const interactions = pgTable("interactions", {
  id: uuid("id").defaultRandom().primaryKey(),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  timestamp: integer("timestamp").notNull(), // Seconds into video
  type: interactionTypeEnum("type").notNull(),
  language: interactionLanguageEnum("language").notNull(),
  prompt: text("prompt").notNull(), // What to show the student
  expectedAnswer: text("expected_answer"), // For AI grading context (nullable)
  videoPromptId: uuid("video_prompt_id").references(() => videoPrompts.id), // For video interactions, link to coach's video prompt
  correctThreshold: integer("correct_threshold").notNull().default(80), // Score 0-100 needed to pass
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("interactions_lesson_id_idx").on(table.lessonId),
]);

// Interaction attempts table - tracks student submission attempts
export const interactionAttempts = pgTable("interaction_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  interactionId: uuid("interaction_id")
    .notNull()
    .references(() => interactions.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  response: text("response").notNull(), // What student submitted
  score: integer("score").notNull(), // 0-100 from AI
  isCorrect: boolean("is_correct").notNull(),
  feedback: text("feedback").notNull(), // AI feedback
  attemptNumber: integer("attempt_number").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("interaction_attempts_interaction_id_idx").on(table.interactionId),
  index("interaction_attempts_user_id_idx").on(table.userId),
]);

// Relations: Interaction belongs to Lesson and optional VideoPrompt
export const interactionsRelations = relations(interactions, ({ one, many }) => ({
  lesson: one(lessons, {
    fields: [interactions.lessonId],
    references: [lessons.id],
  }),
  videoPrompt: one(videoPrompts, {
    fields: [interactions.videoPromptId],
    references: [videoPrompts.id],
  }),
  attempts: many(interactionAttempts),
}));

// Relations: InteractionAttempt belongs to Interaction and User
export const interactionAttemptsRelations = relations(
  interactionAttempts,
  ({ one }) => ({
    interaction: one(interactions, {
      fields: [interactionAttempts.interactionId],
      references: [interactions.id],
    }),
    user: one(users, {
      fields: [interactionAttempts.userId],
      references: [users.id],
    }),
  })
);

// Type inference
export type Interaction = typeof interactions.$inferSelect;
export type NewInteraction = typeof interactions.$inferInsert;
export type InteractionAttempt = typeof interactionAttempts.$inferSelect;
export type NewInteractionAttempt = typeof interactionAttempts.$inferInsert;
