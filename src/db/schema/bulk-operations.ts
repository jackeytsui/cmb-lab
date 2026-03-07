import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// --- Tables ---

// Bulk Operations: tracks batch actions performed on students (assign/remove course/tag)
export const bulkOperations = pgTable("bulk_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationType: text("operation_type").notNull(), // "assign_course" | "remove_course" | "add_tag" | "remove_tag"
  targetId: text("target_id").notNull(), // courseId or tagId
  studentIds: jsonb("student_ids").notNull().$type<string[]>(),
  succeededIds: jsonb("succeeded_ids").notNull().$type<string[]>(),
  performedBy: uuid("performed_by")
    .notNull()
    .references(() => users.id),
  undoneAt: timestamp("undone_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("bulk_operations_performed_by_idx").on(table.performedBy),
]);

// --- Relations ---

export const bulkOperationsRelations = relations(bulkOperations, ({ one }) => ({
  performedByUser: one(users, {
    fields: [bulkOperations.performedBy],
    references: [users.id],
  }),
}));

// --- Type Inference ---

export type BulkOperation = typeof bulkOperations.$inferSelect;
export type NewBulkOperation = typeof bulkOperations.$inferInsert;
