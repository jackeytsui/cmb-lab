import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const promptLabCases = pgTable(
  "prompt_lab_cases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    input: text("input").notNull(),
    expectedPattern: text("expected_pattern"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("prompt_lab_cases_user_id_idx").on(table.userId)]
);

export const promptLabRuns = pgTable(
  "prompt_lab_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    promptA: text("prompt_a").notNull(),
    promptB: text("prompt_b"),
    input: text("input").notNull(),
    outputA: text("output_a").notNull(),
    outputB: text("output_b"),
    passCount: integer("pass_count").notNull().default(0),
    totalCases: integer("total_cases").notNull().default(0),
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("prompt_lab_runs_user_id_idx").on(table.userId),
    index("prompt_lab_runs_created_at_idx").on(table.createdAt),
  ]
);
