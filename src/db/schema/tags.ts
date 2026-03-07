import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// --- Enums ---

export const tagTypeEnum = pgEnum("tag_type", ["coach", "system"]);

// --- Tables ---

// Tags: first-class tagging entities with color and type
export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(), // hex color, e.g. "#ef4444"
  type: tagTypeEnum("type").notNull().default("coach"),
  description: text("description"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => [
  index("tags_created_by_idx").on(table.createdBy),
]);

// Student Tags: join table linking users to tags
export const studentTags = pgTable(
  "student_tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    assignedBy: uuid("assigned_by").references(() => users.id),
    assignedAt: timestamp("assigned_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("student_tags_user_tag_unique").on(table.userId, table.tagId),
    index("student_tags_assigned_by_idx").on(table.assignedBy),
  ]
);

// Auto-Tag Rules: condition-based automatic tag assignment
export const autoTagRules = pgTable("auto_tag_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tagId: uuid("tag_id")
    .notNull()
    .references(() => tags.id, { onDelete: "cascade" }),
  conditionType: text("condition_type").notNull(), // "inactive_days", "no_progress_days", "course_completed"
  conditionValue: text("condition_value").notNull(), // e.g. "7" for 7 days
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("auto_tag_rules_tag_id_idx").on(table.tagId),
  index("auto_tag_rules_created_by_idx").on(table.createdBy),
]);

// --- Relations ---

export const tagsRelations = relations(tags, ({ many }) => ({
  studentTags: many(studentTags),
  autoTagRules: many(autoTagRules),
}));

export const studentTagsRelations = relations(studentTags, ({ one }) => ({
  user: one(users, {
    fields: [studentTags.userId],
    references: [users.id],
    relationName: "studentTagUser",
  }),
  tag: one(tags, {
    fields: [studentTags.tagId],
    references: [tags.id],
  }),
  assignedByUser: one(users, {
    fields: [studentTags.assignedBy],
    references: [users.id],
    relationName: "studentTagAssigner",
  }),
}));

export const autoTagRulesRelations = relations(autoTagRules, ({ one }) => ({
  tag: one(tags, {
    fields: [autoTagRules.tagId],
    references: [tags.id],
  }),
  createdByUser: one(users, {
    fields: [autoTagRules.createdBy],
    references: [users.id],
  }),
}));

// --- Type Inference ---

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type StudentTag = typeof studentTags.$inferSelect;
export type NewStudentTag = typeof studentTags.$inferInsert;

export type AutoTagRule = typeof autoTagRules.$inferSelect;
export type NewAutoTagRule = typeof autoTagRules.$inferInsert;
