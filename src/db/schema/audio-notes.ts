import { pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

/**
 * Student notes for audio course lessons.
 * Each student can have one note per lesson (upsert pattern).
 */
export const audioLessonNotes = pgTable(
  "audio_lesson_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("audio_lesson_notes_user_lesson_idx").on(
      table.userId,
      table.lessonId,
    ),
  ],
);

export const audioLessonNotesRelations = relations(
  audioLessonNotes,
  ({ one }) => ({
    user: one(users, {
      fields: [audioLessonNotes.userId],
      references: [users.id],
    }),
    lesson: one(lessons, {
      fields: [audioLessonNotes.lessonId],
      references: [lessons.id],
    }),
  }),
);

export type AudioLessonNote = typeof audioLessonNotes.$inferSelect;
export type NewAudioLessonNote = typeof audioLessonNotes.$inferInsert;
