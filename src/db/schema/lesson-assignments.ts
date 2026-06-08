import {
  pgTable,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { lessons } from "./courses";

// One submission per (lesson, user). submissionData is type-specific JSON.
// status: 'pending' | 'reviewed'
export const lessonSubmissions = pgTable(
  "lesson_submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => lessons.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submissionData: text("submission_data").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("lesson_submissions_lesson_user_idx").on(table.lessonId, table.userId),
    index("lesson_submissions_lesson_id_idx").on(table.lessonId),
    index("lesson_submissions_user_id_idx").on(table.userId),
    index("lesson_submissions_status_idx").on(table.status),
  ],
);

// One review per submission. reviewData is JSON with comments[], loomUrl, overallFeedback.
export const lessonReviews = pgTable("lesson_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .unique()
    .references(() => lessonSubmissions.id, { onDelete: "cascade" }),
  reviewedBy: uuid("reviewed_by")
    .notNull()
    .references(() => users.id),
  reviewData: text("review_data").notNull(),
  notifiedAt: timestamp("notified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const lessonSubmissionsRelations = relations(lessonSubmissions, ({ one }) => ({
  lesson: one(lessons, {
    fields: [lessonSubmissions.lessonId],
    references: [lessons.id],
  }),
  user: one(users, {
    fields: [lessonSubmissions.userId],
    references: [users.id],
  }),
  review: one(lessonReviews, {
    fields: [lessonSubmissions.id],
    references: [lessonReviews.submissionId],
  }),
}));

export const lessonReviewsRelations = relations(lessonReviews, ({ one }) => ({
  submission: one(lessonSubmissions, {
    fields: [lessonReviews.submissionId],
    references: [lessonSubmissions.id],
  }),
  coach: one(users, {
    fields: [lessonReviews.reviewedBy],
    references: [users.id],
  }),
}));

export type LessonSubmission = typeof lessonSubmissions.$inferSelect;
export type NewLessonSubmission = typeof lessonSubmissions.$inferInsert;
export type LessonReview = typeof lessonReviews.$inferSelect;
export type NewLessonReview = typeof lessonReviews.$inferInsert;
