import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";

// --- Enums ---

export const syncDirectionEnum = pgEnum("sync_direction", [
  "inbound",
  "outbound",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

// --- Tables ---

// GHL Contacts: maps LMS users to GHL contacts (one-to-one)
export const ghlContacts = pgTable("ghl_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  ghlContactId: text("ghl_contact_id").notNull().unique(),
  ghlLocationId: text("ghl_location_id").notNull(),
  lastSyncedAt: timestamp("last_synced_at"),
  syncStatus: text("sync_status").notNull().default("active"),
  cachedData: jsonb("cached_data"), // cached GHL contact data (tags, customFields, timezone, etc.)
  lastFetchedAt: timestamp("last_fetched_at"), // when cachedData was last refreshed from GHL
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Sync Events: audit log and processing queue for all sync operations
export const syncEvents = pgTable("sync_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  eventType: text("event_type").notNull(),
  direction: syncDirectionEnum("direction").notNull(),
  status: syncStatusEnum("status").notNull().default("pending"),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  ghlContactId: text("ghl_contact_id"),
  payload: jsonb("payload").notNull().default({}),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// GHL Field Mappings: admin-configurable custom field mapping
export const ghlFieldMappings = pgTable("ghl_field_mappings", {
  id: uuid("id").defaultRandom().primaryKey(),
  lmsConcept: text("lms_concept").notNull().unique(),
  ghlFieldId: text("ghl_field_id").notNull(),
  ghlFieldName: text("ghl_field_name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// --- Relations ---

export const ghlContactsRelations = relations(ghlContacts, ({ one }) => ({
  user: one(users, {
    fields: [ghlContacts.userId],
    references: [users.id],
  }),
}));

// --- Type Inference ---

export type GhlContact = typeof ghlContacts.$inferSelect;
export type NewGhlContact = typeof ghlContacts.$inferInsert;

export type SyncEvent = typeof syncEvents.$inferSelect;
export type NewSyncEvent = typeof syncEvents.$inferInsert;

export type GhlFieldMapping = typeof ghlFieldMappings.$inferSelect;
export type NewGhlFieldMapping = typeof ghlFieldMappings.$inferInsert;
