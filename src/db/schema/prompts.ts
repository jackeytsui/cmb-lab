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

// Prompt type enum
export const promptTypeEnum = pgEnum("prompt_type", [
  "grading_text",
  "grading_audio",
  "voice_ai",
  "chatbot",
]);

// AI Prompts table - stores the current state of each prompt
export const aiPrompts = pgTable("ai_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(), // e.g., "voice-tutor-system"
  name: text("name").notNull(), // Human-readable name
  type: promptTypeEnum("type").notNull(),
  description: text("description"), // What this prompt controls
  currentContent: text("current_content").notNull(),
  currentVersion: integer("current_version").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// AI Prompt Versions table - stores version history
export const aiPromptVersions = pgTable("ai_prompt_versions", {
  id: uuid("id").defaultRandom().primaryKey(),
  promptId: uuid("prompt_id")
    .notNull()
    .references(() => aiPrompts.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  content: text("content").notNull(),
  changeNote: text("change_note"), // Optional note about what changed
  createdBy: uuid("created_by").references(() => users.id), // Nullable for seed data
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("ai_prompt_versions_prompt_id_idx").on(table.promptId),
  index("ai_prompt_versions_created_by_idx").on(table.createdBy),
]);

// Relations: aiPrompts has many versions
export const aiPromptsRelations = relations(aiPrompts, ({ many }) => ({
  versions: many(aiPromptVersions),
}));

// Relations: aiPromptVersions belongs to prompt, optionally to user
export const aiPromptVersionsRelations = relations(aiPromptVersions, ({ one }) => ({
  prompt: one(aiPrompts, {
    fields: [aiPromptVersions.promptId],
    references: [aiPrompts.id],
  }),
  createdByUser: one(users, {
    fields: [aiPromptVersions.createdBy],
    references: [users.id],
  }),
}));

// Type inference
export type AiPrompt = typeof aiPrompts.$inferSelect;
export type NewAiPrompt = typeof aiPrompts.$inferInsert;
export type AiPromptVersion = typeof aiPromptVersions.$inferSelect;
export type NewAiPromptVersion = typeof aiPromptVersions.$inferInsert;
