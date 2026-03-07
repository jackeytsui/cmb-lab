import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { videoUploads } from "./uploads";

// Video Prompts - Reusable video questions recorded by coaches
export const videoPrompts = pgTable("video_prompts", {
  id: uuid("id").defaultRandom().primaryKey(),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  // Link to the unified upload asset
  uploadId: uuid("upload_id").references(() => videoUploads.id, {
    onDelete: "set null",
  }),

  title: text("title").notNull(), // Internal title for the coach
  description: text("description"), // Optional description
  videoUrl: text("video_url"), // Optional URL (fallback or external)
  transcript: text("transcript"), // Text content of what the coach said
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("video_prompts_coach_id_idx").on(table.coachId),
]);

export const videoPromptsRelations = relations(videoPrompts, ({ one }) => ({
  coach: one(users, {
    fields: [videoPrompts.coachId],
    references: [users.id],
  }),
  upload: one(videoUploads, {
    fields: [videoPrompts.uploadId],
    references: [videoUploads.id],
  }),
}));

export type VideoPrompt = typeof videoPrompts.$inferSelect;
export type NewVideoPrompt = typeof videoPrompts.$inferInsert;
