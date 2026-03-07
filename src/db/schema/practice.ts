import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { interactionLanguageEnum } from "./interactions";
import type { ExerciseDefinition } from "@/types/exercises";

// ============================================================
// Enums
// ============================================================

export const exerciseTypeEnum = pgEnum("exercise_type", [
  "multiple_choice",
  "fill_in_blank",
  "matching",
  "ordering",
  "audio_recording",
  "free_text",
  "video_recording",
]);

export const practiceSetStatusEnum = pgEnum("practice_set_status", [
  "draft",
  "published",
  "archived",
]);

export const assignmentTargetTypeEnum = pgEnum("assignment_target_type", [
  "course",
  "module",
  "lesson",
  "student",
  "tag",
]);

// ============================================================
// Tables
// ============================================================

// Practice Sets — groups of exercises created by coaches
export const practiceSets = pgTable("practice_sets", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: practiceSetStatusEnum("status").notNull().default("draft"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("practice_sets_created_by_idx").on(table.createdBy),
]);

// Practice Exercises — individual exercises within a practice set
export const practiceExercises = pgTable("practice_exercises", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  type: exerciseTypeEnum("type").notNull(),
  language: interactionLanguageEnum("language").notNull(),
  definition: jsonb("definition").notNull().$type<ExerciseDefinition>(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("practice_exercises_practice_set_id_idx").on(table.practiceSetId),
]);

// Practice Set Assignments — assign sets to courses/modules/lessons/students/tags
export const practiceSetAssignments = pgTable(
  "practice_set_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    practiceSetId: uuid("practice_set_id")
      .notNull()
      .references(() => practiceSets.id, { onDelete: "cascade" }),
    targetType: assignmentTargetTypeEnum("target_type").notNull(),
    targetId: uuid("target_id").notNull(), // Polymorphic: course/module/lesson/user/tag ID
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    unique("practice_set_assignments_unique").on(
      table.practiceSetId,
      table.targetType,
      table.targetId
    ),
    index("practice_set_assignments_practice_set_id_idx").on(table.practiceSetId),
    index("practice_set_assignments_assigned_by_idx").on(table.assignedBy),
  ]
);

// Practice Attempts — student attempts at a practice set
export const practiceAttempts = pgTable("practice_attempts", {
  id: uuid("id").defaultRandom().primaryKey(),
  practiceSetId: uuid("practice_set_id")
    .notNull()
    .references(() => practiceSets.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  score: integer("score"), // 0-100 overall score (nullable until completed)
  totalExercises: integer("total_exercises").notNull(),
  correctCount: integer("correct_count").notNull().default(0),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  completedAt: timestamp("completed_at"),
  answers: jsonb("answers").$type<Record<string, unknown>>(), // Auto-saved raw answers
  results:
    jsonb("results").$type<
      Record<string, { score: number; isCorrect: boolean; response: string }>
    >(), // Per-exercise results keyed by exercise ID
}, (table) => [
  index("practice_attempts_practice_set_id_idx").on(table.practiceSetId),
  index("practice_attempts_user_id_idx").on(table.userId),
]);

// ============================================================
// Relations
// ============================================================

export const practiceSetsRelations = relations(
  practiceSets,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [practiceSets.createdBy],
      references: [users.id],
    }),
    exercises: many(practiceExercises),
    assignments: many(practiceSetAssignments),
    attempts: many(practiceAttempts),
  })
);

export const practiceExercisesRelations = relations(
  practiceExercises,
  ({ one }) => ({
    practiceSet: one(practiceSets, {
      fields: [practiceExercises.practiceSetId],
      references: [practiceSets.id],
    }),
  })
);

export const practiceSetAssignmentsRelations = relations(
  practiceSetAssignments,
  ({ one }) => ({
    practiceSet: one(practiceSets, {
      fields: [practiceSetAssignments.practiceSetId],
      references: [practiceSets.id],
    }),
    assignedByUser: one(users, {
      fields: [practiceSetAssignments.assignedBy],
      references: [users.id],
    }),
  })
);

export const practiceAttemptsRelations = relations(
  practiceAttempts,
  ({ one }) => ({
    practiceSet: one(practiceSets, {
      fields: [practiceAttempts.practiceSetId],
      references: [practiceSets.id],
    }),
    user: one(users, {
      fields: [practiceAttempts.userId],
      references: [users.id],
    }),
  })
);

// ============================================================
// Type Inference
// ============================================================

export type PracticeSet = typeof practiceSets.$inferSelect;
export type NewPracticeSet = typeof practiceSets.$inferInsert;
export type PracticeExercise = typeof practiceExercises.$inferSelect;
export type NewPracticeExercise = typeof practiceExercises.$inferInsert;
export type PracticeSetAssignment = typeof practiceSetAssignments.$inferSelect;
export type NewPracticeSetAssignment =
  typeof practiceSetAssignments.$inferInsert;
export type PracticeAttempt = typeof practiceAttempts.$inferSelect;
export type NewPracticeAttempt = typeof practiceAttempts.$inferInsert;
