import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  jsonb,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { videoUploads } from "./uploads";
import { assignmentTargetTypeEnum } from "./practice";

// Thread Step Response Type Enum
export const responseTypeEnum = pgEnum("response_type", [
  "video",
  "audio",
  "text",
  "multiple_choice",
  "button", // simple acknowledgement/next
]);

// Session Status Enum
export const sessionStatusEnum = pgEnum("session_status", [
  "in_progress",
  "completed",
  "abandoned",
]);

// Video Threads - Container for a series of video steps (VideoAsk style)
export const videoThreads = pgTable("video_threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("video_threads_created_by_idx").on(table.createdBy),
]);

// Video Thread Steps - Individual steps in a thread
export const videoThreadSteps = pgTable("video_thread_steps", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => videoThreads.id, { onDelete: "cascade" }),
  
  // The video shown to the student (optional, could be text-only step)
  uploadId: uuid("upload_id").references(() => videoUploads.id, {
    onDelete: "set null",
  }),
  videoUrl: text("video_url"), // Fallback/direct URL
  
  // Content
  promptText: text("prompt_text"), // Text overlay or question
  
  // Student Response Configuration
  responseType: responseTypeEnum("response_type").notNull().default("video"),
  allowedResponseTypes: jsonb("allowed_response_types"), // Array of allowed types e.g. ["video", "audio"]
  responseOptions: jsonb("response_options"), // JSON for MC/Button options
  logic: jsonb("logic"), // Branching logic: { condition: string, nextStepId: string }[]
  
  // New Logic Engine (n8n style)
  logicRules: jsonb("logic_rules"), // Array of { id, field, operator, value, nextStepId }
  fallbackStepId: uuid("fallback_step_id"), // Default path if no rules match

  isEndScreen: boolean("is_end_screen").default(false),
  
  sortOrder: integer("sort_order").notNull().default(0),

  // React Flow node positions (persisted for layout)
  positionX: integer("position_x").notNull().default(0),
  positionY: integer("position_y").notNull().default(150),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("video_thread_steps_thread_id_idx").on(table.threadId),
]);

// Video Thread Sessions - Tracks a student's attempt through a thread
export const videoThreadSessions = pgTable("video_thread_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => videoThreads.id, { onDelete: "cascade" }),
  studentId: uuid("student_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  status: sessionStatusEnum("status").notNull().default("in_progress"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  lastStepId: uuid("last_step_id"), // Tracks where student is for future resume
}, (table) => [
  index("video_thread_sessions_thread_student_idx").on(table.threadId, table.studentId),
]);

// Video Thread Responses - Individual responses to steps within a session
export const videoThreadResponses = pgTable("video_thread_responses", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => videoThreadSessions.id, { onDelete: "cascade" }),
  stepId: uuid("step_id")
    .notNull()
    .references(() => videoThreadSteps.id, { onDelete: "cascade" }),
  responseType: responseTypeEnum("response_type").notNull(),
  content: text("content"), // Text answer or selected option value
  metadata: jsonb("metadata"), // For future expansion: timing data, etc.
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("video_thread_responses_session_id_idx").on(table.sessionId),
  index("video_thread_responses_step_id_idx").on(table.stepId),
]);

// Thread Assignments — coach assigns video threads to students/groups
export const threadAssignments = pgTable("thread_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => videoThreads.id, { onDelete: "cascade" }),
  targetType: assignmentTargetTypeEnum("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  assignedBy: uuid("assigned_by")
    .notNull()
    .references(() => users.id),
  notes: text("notes"),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("thread_assignments_assigned_by_idx").on(table.assignedBy),
  index("thread_assignments_thread_id_idx").on(table.threadId),
  unique("thread_assignments_thread_target_unique").on(
    table.threadId,
    table.targetType,
    table.targetId
  ),
]);

// Coach Reviews on thread sessions (builder/coach feedback metadata)
export const videoThreadSessionReviews = pgTable("video_thread_session_reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => videoThreadSessions.id, { onDelete: "cascade" }),
  coachId: uuid("coach_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  message: text("message"),
  loomUrl: text("loom_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("video_thread_session_reviews_session_idx").on(table.sessionId),
  index("video_thread_session_reviews_coach_idx").on(table.coachId),
]);

// Relations
export const videoThreadsRelations = relations(videoThreads, ({ one, many }) => ({
  creator: one(users, {
    fields: [videoThreads.createdBy],
    references: [users.id],
  }),
  steps: many(videoThreadSteps),
  sessions: many(videoThreadSessions),
  assignments: many(threadAssignments),
}));

export const videoThreadStepsRelations = relations(videoThreadSteps, ({ one, many }) => ({
  thread: one(videoThreads, {
    fields: [videoThreadSteps.threadId],
    references: [videoThreads.id],
  }),
  upload: one(videoUploads, {
    fields: [videoThreadSteps.uploadId],
    references: [videoUploads.id],
  }),
  responses: many(videoThreadResponses),
}));

export const videoThreadSessionsRelations = relations(videoThreadSessions, ({ one, many }) => ({
  thread: one(videoThreads, {
    fields: [videoThreadSessions.threadId],
    references: [videoThreads.id],
  }),
  student: one(users, {
    fields: [videoThreadSessions.studentId],
    references: [users.id],
  }),
  responses: many(videoThreadResponses),
  reviews: many(videoThreadSessionReviews),
}));

export const videoThreadResponsesRelations = relations(videoThreadResponses, ({ one }) => ({
  session: one(videoThreadSessions, {
    fields: [videoThreadResponses.sessionId],
    references: [videoThreadSessions.id],
  }),
  step: one(videoThreadSteps, {
    fields: [videoThreadResponses.stepId],
    references: [videoThreadSteps.id],
  }),
}));

export const threadAssignmentsRelations = relations(threadAssignments, ({ one }) => ({
  thread: one(videoThreads, {
    fields: [threadAssignments.threadId],
    references: [videoThreads.id],
  }),
  assignedByUser: one(users, {
    fields: [threadAssignments.assignedBy],
    references: [users.id],
  }),
}));

export const videoThreadSessionReviewsRelations = relations(
  videoThreadSessionReviews,
  ({ one }) => ({
    session: one(videoThreadSessions, {
      fields: [videoThreadSessionReviews.sessionId],
      references: [videoThreadSessions.id],
    }),
    coach: one(users, {
      fields: [videoThreadSessionReviews.coachId],
      references: [users.id],
    }),
  })
);

export type VideoThread = typeof videoThreads.$inferSelect;
export type NewVideoThread = typeof videoThreads.$inferInsert;
export type VideoThreadStep = typeof videoThreadSteps.$inferSelect;
export type NewVideoThreadStep = typeof videoThreadSteps.$inferInsert;
export type VideoThreadSession = typeof videoThreadSessions.$inferSelect;
export type NewVideoThreadSession = typeof videoThreadSessions.$inferInsert;
export type VideoThreadResponse = typeof videoThreadResponses.$inferSelect;
export type NewVideoThreadResponse = typeof videoThreadResponses.$inferInsert;
export type ThreadAssignment = typeof threadAssignments.$inferSelect;
export type NewThreadAssignment = typeof threadAssignments.$inferInsert;
export type VideoThreadSessionReview = typeof videoThreadSessionReviews.$inferSelect;
export type NewVideoThreadSessionReview = typeof videoThreadSessionReviews.$inferInsert;
