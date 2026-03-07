import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const assessmentTypeEnum = pgEnum("assessment_type", [
  "placement",
  "hsk_mock",
  "custom",
]);

export const assessments = pgTable(
  "assessments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    type: assessmentTypeEnum("type").notNull().default("custom"),
    hskLevel: integer("hsk_level"),
    passThreshold: integer("pass_threshold").notNull().default(70),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("assessments_type_idx").on(table.type)]
);

export const assessmentQuestions = pgTable(
  "assessment_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    skillArea: text("skill_area").notNull().default("vocabulary"),
    difficulty: integer("difficulty").notNull().default(1),
    prompt: text("prompt").notNull(),
    type: text("type").notNull().default("multiple_choice"),
    definition: jsonb("definition").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("assessment_questions_assessment_id_idx").on(table.assessmentId)]
);

export const assessmentAttempts = pgTable(
  "assessment_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    score: integer("score").notNull().default(0),
    sectionScores: jsonb("section_scores").$type<Record<string, number>>(),
    estimatedHskLevel: integer("estimated_hsk_level"),
    answers: jsonb("answers").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("assessment_attempts_assessment_id_idx").on(table.assessmentId),
    index("assessment_attempts_user_id_idx").on(table.userId),
  ]
);

export type Assessment = typeof assessments.$inferSelect;
