import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const betaFeedbackCategoryEnum = pgEnum("beta_feedback_category", [
  "bug",
  "feature_request",
  "general",
]);

export const betaFeedbackStatusEnum = pgEnum("beta_feedback_status", [
  "new",
  "reviewing",
  "planned",
  "resolved",
  "closed",
]);

export const betaFeedback = pgTable(
  "beta_feedback",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: betaFeedbackCategoryEnum("category").notNull(),
    message: text("message").notNull(),
    pagePath: text("page_path"),
    source: varchar("source", { length: 32 }).notNull().default("chatbot"),
    status: betaFeedbackStatusEnum("status").notNull().default("new"),
    adminNote: text("admin_note"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("beta_feedback_status_created_idx").on(table.status, table.createdAt),
    index("beta_feedback_category_idx").on(table.category),
    index("beta_feedback_user_idx").on(table.userId),
  ],
);

export const betaFeedbackRelations = relations(betaFeedback, ({ one }) => ({
  user: one(users, {
    fields: [betaFeedback.userId],
    references: [users.id],
    relationName: "betaFeedbackAuthor",
  }),
  reviewer: one(users, {
    fields: [betaFeedback.reviewedBy],
    references: [users.id],
    relationName: "betaFeedbackReviewer",
  }),
}));

export type BetaFeedback = typeof betaFeedback.$inferSelect;
export type NewBetaFeedback = typeof betaFeedback.$inferInsert;
export type BetaFeedbackCategory =
  (typeof betaFeedbackCategoryEnum.enumValues)[number];
export type BetaFeedbackStatus =
  (typeof betaFeedbackStatusEnum.enumValues)[number];
