import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  pgEnum,
  index,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const grammarStatusEnum = pgEnum("grammar_status", [
  "draft",
  "published",
]);

export const grammarPatterns = pgTable(
  "grammar_patterns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    hskLevel: integer("hsk_level").notNull().default(1),
    category: text("category").notNull(),
    title: text("title").notNull(),
    pattern: text("pattern").notNull(),
    pinyin: text("pinyin"),
    explanation: text("explanation").notNull(),
    examples: text("examples").array().notNull().default([]),
    translations: text("translations").array().notNull().default([]),
    mistakes: text("mistakes").array().notNull().default([]),
    cantoneseDiff: text("cantonese_diff"),
    relatedLessonIds: text("related_lesson_ids").array().notNull().default([]),
    relatedPracticeSetIds: text("related_practice_set_ids").array().notNull().default([]),
    status: grammarStatusEnum("status").notNull().default("draft"),
    aiGenerated: boolean("ai_generated").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("grammar_patterns_hsk_level_idx").on(table.hskLevel),
    index("grammar_patterns_category_idx").on(table.category),
    index("grammar_patterns_status_idx").on(table.status),
  ]
);

export const grammarBookmarks = pgTable(
  "grammar_bookmarks",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    patternId: uuid("pattern_id")
      .notNull()
      .references(() => grammarPatterns.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("grammar_bookmarks_user_id_idx").on(table.userId),
    index("grammar_bookmarks_pattern_id_idx").on(table.patternId),
  ]
);

export const grammarPatternsRelations = relations(grammarPatterns, ({ one }) => ({
  creator: one(users, {
    fields: [grammarPatterns.createdBy],
    references: [users.id],
  }),
}));

export type GrammarPattern = typeof grammarPatterns.$inferSelect;
export type NewGrammarPattern = typeof grammarPatterns.$inferInsert;
