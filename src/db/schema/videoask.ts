import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The single VideoAsk organization connected to CMB Lab.
 *
 * OAuth credentials are encrypted with AES-256-GCM before they reach Neon.
 * The fixed primary key makes reconnecting an atomic upsert instead of creating
 * a trail of stale credentials.
 */
export const videoaskIntegration = pgTable(
  "videoask_integration",
  {
    id: text("id").primaryKey().default("primary"),
    organizationId: text("organization_id").notNull(),
    organizationName: text("organization_name").notNull(),
    accessTokenEncrypted: text("access_token_encrypted").notNull(),
    refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
    accessTokenExpiresAt: timestamp("access_token_expires_at").notNull(),
    scope: text("scope"),
    connectedBy: uuid("connected_by").references(() => users.id, {
      onDelete: "set null",
    }),
    lastValidatedAt: timestamp("last_validated_at").notNull().defaultNow(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("videoask_integration_organization_idx").on(table.organizationId),
  ],
);

export type VideoAskIntegration = typeof videoaskIntegration.$inferSelect;
