import {
  pgEnum,
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

export const engagementFeatureEnum = pgEnum("engagement_feature", [
  "ai_passage_reader",
  "youtube_listening_lab",
  "coaching_one_on_one",
  "coaching_inner_circle",
]);

export const engagementEventTypeEnum = pgEnum("engagement_event_type", [
  "page_view",
  "action",
  "session_end",
]);

export const featureEngagementEvents = pgTable(
  "feature_engagement_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    feature: engagementFeatureEnum("feature").notNull(),
    eventType: engagementEventTypeEnum("event_type").notNull(),
    action: text("action"),
    route: text("route"),
    sessionKey: text("session_key"),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("feature_engagement_events_user_idx").on(table.userId),
    index("feature_engagement_events_feature_idx").on(table.feature),
    index("feature_engagement_events_event_type_idx").on(table.eventType),
    index("feature_engagement_events_created_at_idx").on(table.createdAt),
    index("feature_engagement_events_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);

export const featureEngagementEventsRelations = relations(
  featureEngagementEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [featureEngagementEvents.userId],
      references: [users.id],
    }),
  }),
);

export type FeatureEngagementEvent = typeof featureEngagementEvents.$inferSelect;
export type NewFeatureEngagementEvent = typeof featureEngagementEvents.$inferInsert;
export type EngagementFeature = (typeof engagementFeatureEnum.enumValues)[number];
export type EngagementEventType = (typeof engagementEventTypeEnum.enumValues)[number];
