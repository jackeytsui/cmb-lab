import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

/** Live group-coaching events shown in the student CMB Lab schedule. */
export const groupCoachingEvents = pgTable(
  "group_coaching_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    hostName: text("host_name").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(60),
    meetingUrl: text("meeting_url").notNull(),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("group_coaching_events_starts_at_idx").on(table.startsAt),
  ],
);

export const groupCoachingEventsRelations = relations(
  groupCoachingEvents,
  ({ one }) => ({
    creator: one(users, {
      fields: [groupCoachingEvents.createdBy],
      references: [users.id],
    }),
  }),
);

/** Idempotency ledger for scheduled in-app coaching reminders. */
export const groupCoachingEventReminders = pgTable(
  "group_coaching_event_reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => groupCoachingEvents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminderKey: text("reminder_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("group_coaching_reminders_event_user_key_unique").on(
      table.eventId,
      table.userId,
      table.reminderKey,
    ),
    index("group_coaching_reminders_event_idx").on(table.eventId),
  ],
);

export type GroupCoachingEvent = typeof groupCoachingEvents.$inferSelect;
export type NewGroupCoachingEvent = typeof groupCoachingEvents.$inferInsert;
