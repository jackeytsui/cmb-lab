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
import { interactions } from "./interactions";
import { lessons } from "./courses";

// Submission type enum
export const submissionTypeEnum = pgEnum("submission_type", ["text", "audio", "video"]);

// Submission status enum
export const submissionStatusEnum = pgEnum("submission_status", [
  "pending_review",
  "reviewed",
  "archived",
]);

// Submissions table - captures student work for coach review
export const submissions = pgTable("submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  interactionId: uuid("interaction_id")
    .notNull()
    .references(() => interactions.id, { onDelete: "cascade" }),
  lessonId: uuid("lesson_id")
    .notNull()
    .references(() => lessons.id, { onDelete: "cascade" }),
  type: submissionTypeEnum("type").notNull(),
  response: text("response").notNull(), // Student's text response
  audioData: text("audio_data"), // Base64-encoded audio data (for audio submissions)
  videoUrl: text("video_url"), // URL for video submissions
  score: integer("score").notNull(), // AI grading score 0-100
  aiFeedback: text("ai_feedback").notNull(), // AI feedback text
  transcription: text("transcription"), // AI transcription for audio submissions
  status: submissionStatusEnum("status").notNull().default("pending_review"),
  reviewedAt: timestamp("reviewed_at"), // When coach reviewed
  reviewedBy: uuid("reviewed_by").references(() => users.id), // Which coach reviewed
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("submissions_user_id_idx").on(table.userId),
  index("submissions_interaction_id_idx").on(table.interactionId),
  index("submissions_lesson_id_idx").on(table.lessonId),
  index("submissions_reviewed_by_idx").on(table.reviewedBy),
]);

// Coach feedback table - stores Loom links and written feedback per submission
export const coachFeedback = pgTable("coach_feedback", {
  id: uuid("id").defaultRandom().primaryKey(),
  submissionId: uuid("submission_id")
    .notNull()
    .unique() // One feedback per submission
    .references(() => submissions.id, { onDelete: "cascade" }),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  loomUrl: text("loom_url"), // Loom video link
  feedbackText: text("feedback_text"), // Written feedback
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("coach_feedback_coach_id_idx").on(table.coachId),
]);

// Relations: Submission belongs to User, Interaction, Lesson
export const submissionsRelations = relations(submissions, ({ one }) => ({
  user: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
  interaction: one(interactions, {
    fields: [submissions.interactionId],
    references: [interactions.id],
  }),
  lesson: one(lessons, {
    fields: [submissions.lessonId],
    references: [lessons.id],
  }),
  reviewedByUser: one(users, {
    fields: [submissions.reviewedBy],
    references: [users.id],
    relationName: "reviewer",
  }),
  feedback: one(coachFeedback),
}));

// Relations: CoachFeedback belongs to Submission and Coach
export const coachFeedbackRelations = relations(coachFeedback, ({ one }) => ({
  submission: one(submissions, {
    fields: [coachFeedback.submissionId],
    references: [submissions.id],
  }),
  coach: one(users, {
    fields: [coachFeedback.coachId],
    references: [users.id],
  }),
}));

// Type inference
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type CoachFeedback = typeof coachFeedback.$inferSelect;
export type NewCoachFeedback = typeof coachFeedback.$inferInsert;
