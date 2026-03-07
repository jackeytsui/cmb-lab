import {
  pgTable,
  uuid,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

// Lesson progress table - tracks individual lesson progress per user
export const lessonProgress = pgTable(
  "lesson_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    // Video completion tracking
    videoWatchedPercent: integer("video_watched_percent").notNull().default(0),
    videoCompletedAt: timestamp("video_completed_at"), // Set when 95%+ reached
    // Interaction completion tracking
    interactionsCompleted: integer("interactions_completed").notNull().default(0),
    interactionsTotal: integer("interactions_total").notNull().default(0),
    // Overall lesson completion
    completedAt: timestamp("completed_at"), // Set when both video + interactions done
    // Timestamps
    startedAt: timestamp("started_at").notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at").notNull().defaultNow(),
  },
  (table) => [
    // Composite unique constraint: one progress record per user per lesson
    unique("lesson_progress_user_lesson_unique").on(table.userId, table.lessonId),
    index("lesson_progress_lesson_id_idx").on(table.lessonId),
  ]
);

// Relations: LessonProgress belongs to User and Lesson
export const lessonProgressRelations = relations(lessonProgress, ({ one }) => ({
  user: one(users, {
    fields: [lessonProgress.userId],
    references: [users.id],
  }),
  lesson: one(lessons, {
    fields: [lessonProgress.lessonId],
    references: [lessons.id],
  }),
}));

// Type inference
export type LessonProgress = typeof lessonProgress.$inferSelect;
export type NewLessonProgress = typeof lessonProgress.$inferInsert;
