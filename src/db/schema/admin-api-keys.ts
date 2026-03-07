import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const adminApiKeys = pgTable("admin_api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  keyPrefix: text("key_prefix").notNull().unique(),
  keyHash: text("key_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("admin_api_keys_created_at_idx").on(table.createdAt),
  index("admin_api_keys_revoked_at_idx").on(table.revokedAt),
]);

export type AdminApiKey = typeof adminApiKeys.$inferSelect;
export type NewAdminApiKey = typeof adminApiKeys.$inferInsert;
