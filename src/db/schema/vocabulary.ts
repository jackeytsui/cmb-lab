import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./users";

// ============================================================
// Tables
// ============================================================

// User-saved vocabulary words (bookmarked from dictionary lookups)
export const savedVocabulary = pgTable(
  "saved_vocabulary",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    traditional: varchar("traditional", { length: 50 }).notNull(),
    simplified: varchar("simplified", { length: 50 }).notNull(),
    pinyin: varchar("pinyin", { length: 200 }),
    jyutping: varchar("jyutping", { length: 200 }),
    definitions: text("definitions")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    notes: text("notes"), // user's personal notes
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("saved_vocabulary_user_id_idx").on(table.userId),
    index("saved_vocabulary_user_traditional_idx").on(
      table.userId,
      table.traditional
    ),
  ]
);

// User-created vocabulary lists (e.g., "Food", "Chapter 1")
export const vocabularyLists = pgTable(
  "vocabulary_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("vocabulary_lists_user_id_idx").on(table.userId)]
);

// Assignments of vocabulary lists from coaches to students
export const vocabularyListAssignments = pgTable(
  "vocabulary_list_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listId: uuid("list_id")
      .notNull()
      .references(() => vocabularyLists.id, { onDelete: "cascade" }),
    assignedToUserId: uuid("assigned_to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueDate: timestamp("due_date"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("vocabulary_list_assignments_student_idx").on(table.assignedToUserId),
    index("vocabulary_list_assignments_list_idx").on(table.listId),
  ]
);

// Many-to-many link between lists and saved words
export const vocabularyListItems = pgTable(
  "vocabulary_list_items",
  {
    listId: uuid("list_id")
      .notNull()
      .references(() => vocabularyLists.id, { onDelete: "cascade" }),
    savedVocabularyId: uuid("saved_vocabulary_id")
      .notNull()
      .references(() => savedVocabulary.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at").notNull().defaultNow(),
  },
  (table) => [
    // Composite primary key
    primaryKey({ columns: [table.listId, table.savedVocabularyId] }),
    index("vocabulary_list_items_list_id_idx").on(table.listId),
    index("vocabulary_list_items_saved_vocab_id_idx").on(
      table.savedVocabularyId
    ),
  ]
);

// ============================================================
// Relations
// ============================================================

export const savedVocabularyRelations = relations(
  savedVocabulary,
  ({ one, many }) => ({
    user: one(users, {
      fields: [savedVocabulary.userId],
      references: [users.id],
    }),
    listItems: many(vocabularyListItems),
  })
);

export const vocabularyListsRelations = relations(
  vocabularyLists,
  ({ one, many }) => ({
    user: one(users, {
      fields: [vocabularyLists.userId],
      references: [users.id],
    }),
    items: many(vocabularyListItems),
    assignments: many(vocabularyListAssignments),
  })
);

export const vocabularyListAssignmentsRelations = relations(
  vocabularyListAssignments,
  ({ one }) => ({
    list: one(vocabularyLists, {
      fields: [vocabularyListAssignments.listId],
      references: [vocabularyLists.id],
    }),
    student: one(users, {
      fields: [vocabularyListAssignments.assignedToUserId],
      references: [users.id],
      relationName: "assignedVocabularyStudent",
    }),
    coach: one(users, {
      fields: [vocabularyListAssignments.assignedByUserId],
      references: [users.id],
      relationName: "assignedVocabularyCoach",
    }),
  })
);

export const vocabularyListItemsRelations = relations(
  vocabularyListItems,
  ({ one }) => ({
    list: one(vocabularyLists, {
      fields: [vocabularyListItems.listId],
      references: [vocabularyLists.id],
    }),
    savedVocabulary: one(savedVocabulary, {
      fields: [vocabularyListItems.savedVocabularyId],
      references: [savedVocabulary.id],
    }),
  })
);

// ============================================================
// Type Inference
// ============================================================

export type SavedVocabulary = typeof savedVocabulary.$inferSelect;
export type NewSavedVocabulary = typeof savedVocabulary.$inferInsert;

export type VocabularyList = typeof vocabularyLists.$inferSelect;
export type NewVocabularyList = typeof vocabularyLists.$inferInsert;

export type VocabularyListAssignment = typeof vocabularyListAssignments.$inferSelect;
export type NewVocabularyListAssignment = typeof vocabularyListAssignments.$inferInsert;

export type VocabularyListItem = typeof vocabularyListItems.$inferSelect;
export type NewVocabularyListItem = typeof vocabularyListItems.$inferInsert;
