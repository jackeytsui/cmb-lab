import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Knowledge base entry status enum
export const kbEntryStatusEnum = pgEnum("kb_entry_status", [
  "draft",
  "published",
]);

// Knowledge base categories
export const kbCategories = pgTable("kb_categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Knowledge base entries (manual knowledge entries with rich text)
export const kbEntries = pgTable("kb_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  categoryId: uuid("category_id").references(() => kbCategories.id, {
    onDelete: "set null",
  }),
  status: kbEntryStatusEnum("status").notNull().default("published"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.clerkId, { onDelete: "cascade" }),
  updatedBy: text("updated_by").references(() => users.clerkId, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("kb_entries_category_id_idx").on(table.categoryId),
]);

// Knowledge base file sources (uploaded PDF/doc files)
export const kbFileSources = pgTable("kb_file_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => kbEntries.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: text("storage_key").notNull(),
  processedAt: timestamp("processed_at"),
  chunkCount: integer("chunk_count").default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("kb_file_sources_entry_id_idx").on(table.entryId),
]);

// Knowledge base chunks (searchable text chunks from entries and files)
export const kbChunks = pgTable("kb_chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  entryId: uuid("entry_id")
    .notNull()
    .references(() => kbEntries.id, { onDelete: "cascade" }),
  fileSourceId: uuid("file_source_id").references(() => kbFileSources.id, {
    onDelete: "cascade",
  }),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("kb_chunks_entry_id_idx").on(table.entryId),
  index("kb_chunks_file_source_id_idx").on(table.fileSourceId),
]);

// Relations
export const kbCategoriesRelations = relations(kbCategories, ({ many }) => ({
  entries: many(kbEntries),
}));

export const kbEntriesRelations = relations(kbEntries, ({ one, many }) => ({
  category: one(kbCategories, {
    fields: [kbEntries.categoryId],
    references: [kbCategories.id],
  }),
  fileSources: many(kbFileSources),
  chunks: many(kbChunks),
}));

export const kbFileSourcesRelations = relations(
  kbFileSources,
  ({ one, many }) => ({
    entry: one(kbEntries, {
      fields: [kbFileSources.entryId],
      references: [kbEntries.id],
    }),
    chunks: many(kbChunks),
  })
);

export const kbChunksRelations = relations(kbChunks, ({ one }) => ({
  entry: one(kbEntries, {
    fields: [kbChunks.entryId],
    references: [kbEntries.id],
  }),
  fileSource: one(kbFileSources, {
    fields: [kbChunks.fileSourceId],
    references: [kbFileSources.id],
  }),
}));

// Type inference
export type KbCategory = typeof kbCategories.$inferSelect;
export type NewKbCategory = typeof kbCategories.$inferInsert;
export type KbEntry = typeof kbEntries.$inferSelect;
export type NewKbEntry = typeof kbEntries.$inferInsert;
export type KbFileSource = typeof kbFileSources.$inferSelect;
export type NewKbFileSource = typeof kbFileSources.$inferInsert;
export type KbChunk = typeof kbChunks.$inferSelect;
export type NewKbChunk = typeof kbChunks.$inferInsert;
