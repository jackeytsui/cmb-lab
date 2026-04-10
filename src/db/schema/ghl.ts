import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  jsonb,
  integer,
  boolean,
  uniqueIndex,
  index,
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

// GHL Locations: stores credentials for each connected GHL sub-account
export const ghlLocations = pgTable("ghl_locations", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(), // display name, e.g. "Main Sub-Account"
  ghlLocationId: text("ghl_location_id").notNull().unique(),
  apiToken: text("api_token").notNull(), // encrypted at app layer
  webhookSecret: text("webhook_secret"), // per-location webhook verification
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// GHL Contacts: maps LMS users to GHL contacts (many-per-user for multi-location)
export const ghlContacts = pgTable("ghl_contacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  ghlContactId: text("ghl_contact_id").notNull(),
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
}, (table) => [
  uniqueIndex("ghl_contacts_user_location_unique").on(table.userId, table.ghlLocationId),
  uniqueIndex("ghl_contacts_ghl_contact_id_unique").on(table.ghlContactId),
  index("ghl_contacts_user_id_idx").on(table.userId),
]);

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

export const ghlLocationsRelations = relations(ghlLocations, ({ many }) => ({
  contacts: many(ghlContacts),
}));

export const ghlContactsRelations = relations(ghlContacts, ({ one }) => ({
  user: one(users, {
    fields: [ghlContacts.userId],
    references: [users.id],
  }),
  location: one(ghlLocations, {
    fields: [ghlContacts.ghlLocationId],
    references: [ghlLocations.ghlLocationId],
  }),
}));

// --- Type Inference ---

export type GhlLocation = typeof ghlLocations.$inferSelect;
export type NewGhlLocation = typeof ghlLocations.$inferInsert;

export type GhlContact = typeof ghlContacts.$inferSelect;
export type NewGhlContact = typeof ghlContacts.$inferInsert;

export type SyncEvent = typeof syncEvents.$inferSelect;
export type NewSyncEvent = typeof syncEvents.$inferInsert;

export type GhlFieldMapping = typeof ghlFieldMappings.$inferSelect;
export type NewGhlFieldMapping = typeof ghlFieldMappings.$inferInsert;
