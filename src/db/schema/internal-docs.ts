import { pgTable, uuid, text, jsonb, integer, timestamp } from "drizzle-orm/pg-core";

export const internalDocs = pgTable("internal_docs", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  content: jsonb("content"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type InternalDoc = typeof internalDocs.$inferSelect;
export type NewInternalDoc = typeof internalDocs.$inferInsert;
