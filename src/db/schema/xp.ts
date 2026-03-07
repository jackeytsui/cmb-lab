import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  date,
  boolean,
  pgEnum,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// ============================================================
// Enums
// ============================================================

export const xpSourceEnum = pgEnum("xp_source", [
  "lesson_complete",
  "practice_exercise",
  "practice_perfect",
  "voice_conversation",
  "daily_goal_met",
]);

// ============================================================
// Tables
// ============================================================

// Append-only XP event ledger — records every XP-earning action
export const xpEvents = pgTable(
  "xp_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: xpSourceEnum("source").notNull(),
    amount: integer("amount").notNull(),
    entityId: uuid("entity_id"), // nullable — null for daily_goal_met
    entityType: text("entity_type"), // "lesson", "practice_set", "conversation", null
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("xp_events_user_id_idx").on(table.userId),
    index("xp_events_user_id_created_at_idx").on(table.userId, table.createdAt),
  ]
);

// Daily activity summary — one row per user per day (denormalized for O(1) reads)
export const dailyActivity = pgTable(
  "daily_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityDate: date("activity_date").notNull(), // YYYY-MM-DD in user's timezone
    totalXp: integer("total_xp").notNull().default(0),
    lessonCount: integer("lesson_count").notNull().default(0),
    practiceCount: integer("practice_count").notNull().default(0),
    conversationCount: integer("conversation_count").notNull().default(0),
    goalXp: integer("goal_xp").notNull(), // snapshot of user's dailyGoalXp at time of first activity
    goalMet: boolean("goal_met").notNull().default(false),
    streakFreezeUsed: boolean("streak_freeze_used").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("daily_activity_user_date_unique").on(
      table.userId,
      table.activityDate
    ),
    index("daily_activity_user_id_idx").on(table.userId),
    index("daily_activity_user_id_date_idx").on(
      table.userId,
      table.activityDate
    ),
  ]
);

// ============================================================
// Relations
// ============================================================

export const xpEventsRelations = relations(xpEvents, ({ one }) => ({
  user: one(users, {
    fields: [xpEvents.userId],
    references: [users.id],
  }),
}));

export const dailyActivityRelations = relations(dailyActivity, ({ one }) => ({
  user: one(users, {
    fields: [dailyActivity.userId],
    references: [users.id],
  }),
}));

// ============================================================
// Type Inference
// ============================================================

export type XPEvent = typeof xpEvents.$inferSelect;
export type NewXPEvent = typeof xpEvents.$inferInsert;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type NewDailyActivity = typeof dailyActivity.$inferInsert;
export type XPSource = (typeof xpSourceEnum.enumValues)[number];
