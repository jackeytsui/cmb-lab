import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// --- Tables ---

// Filter Presets: saved search/filter configurations for the student management dashboard
export const filterPresets = pgTable("filter_presets", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull().$type<{
    search?: string;
    tagIds?: string[];
    courseId?: string;
    progressStatus?: string;
    atRisk?: boolean;
    sortBy?: string;
    sortOrder?: "asc" | "desc";
  }>(),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("filter_presets_created_by_idx").on(table.createdBy),
]);

// --- Relations ---

export const filterPresetsRelations = relations(filterPresets, ({ one }) => ({
  createdByUser: one(users, {
    fields: [filterPresets.createdBy],
    references: [users.id],
  }),
}));

// --- Type Inference ---

export type FilterPreset = typeof filterPresets.$inferSelect;
export type NewFilterPreset = typeof filterPresets.$inferInsert;
