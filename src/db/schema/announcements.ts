import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { users } from "./users";
import type { PlatformRole } from "@/lib/platform-roles";
import type { AnnouncementAudienceMode } from "@/lib/announcement-audience";

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    linkUrl: text("link_url"),
    linkLabel: text("link_label"),
    audienceMode: text("audience_mode")
      .$type<AnnouncementAudienceMode>()
      .notNull()
      .default("all"),
    audienceTagIds: jsonb("audience_tag_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    audienceRoles: jsonb("audience_roles")
      .$type<PlatformRole[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("announcements_active_published_idx").on(
      table.isActive,
      table.publishedAt,
    ),
    uniqueIndex("announcements_single_active_unique")
      .on(table.isActive)
      .where(sql`${table.isActive} = true`),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_unique").on(table.endpoint),
    index("push_subscriptions_user_idx").on(table.userId),
  ],
);

export const announcementsRelations = relations(announcements, ({ one }) => ({
  author: one(users, {
    fields: [announcements.createdBy],
    references: [users.id],
  }),
}));

export const pushSubscriptionsRelations = relations(
  pushSubscriptions,
  ({ one }) => ({
    user: one(users, {
      fields: [pushSubscriptions.userId],
      references: [users.id],
    }),
  }),
);

export type Announcement = typeof announcements.$inferSelect;
export type NewAnnouncement = typeof announcements.$inferInsert;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
