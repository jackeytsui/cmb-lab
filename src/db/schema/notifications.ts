import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// Notification type enum
export const notificationTypeEnum = pgEnum("notification_type", [
  "coach_feedback",
  "submission_graded",
  "course_access",
  "system",
]);

// Notification category enum (for mute preferences)
export const notificationCategoryEnum = pgEnum("notification_category", [
  "feedback", // Coach feedback, AI grading results
  "progress", // Course access, milestones
  "system", // System announcements, maintenance
]);

// Notifications table
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    category: notificationCategoryEnum("category").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    read: boolean("read").notNull().default(false),
    linkUrl: text("link_url"), // Deep link into the app
    metadata: text("metadata"), // JSON string for extra data
    createdAt: timestamp("created_at").notNull().defaultNow(),
    readAt: timestamp("read_at"),
    deletedAt: timestamp("deleted_at"), // Soft delete (codebase pattern)
  },
  (table) => [
    index("notifications_user_read_idx").on(table.userId, table.read),
    index("notifications_user_created_idx").on(table.userId, table.createdAt),
  ]
);

// Notification preferences table
export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: notificationCategoryEnum("category").notNull(),
    muted: boolean("muted").notNull().default(false),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("notification_prefs_user_idx").on(table.userId)]
);

// Relations
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(
  notificationPreferences,
  ({ one }) => ({
    user: one(users, {
      fields: [notificationPreferences.userId],
      references: [users.id],
    }),
  })
);

// Type inference
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationPreference =
  typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference =
  typeof notificationPreferences.$inferInsert;
