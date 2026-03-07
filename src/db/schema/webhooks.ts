import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// --- Tables ---

// Processed Webhooks: idempotency tracking for inbound webhooks
export const processedWebhooks = pgTable("processed_webhooks", {
  id: uuid("id").defaultRandom().primaryKey(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  source: text("source").notNull(),
  eventType: text("event_type").notNull(),
  payload: jsonb("payload"),
  result: text("result").notNull(),
  resultData: jsonb("result_data"),
  processedAt: timestamp("processed_at").notNull().defaultNow(),
}, (table) => [
  index("processed_webhooks_processed_at_idx").on(table.processedAt),
]);

// --- Type Inference ---

export type ProcessedWebhook = typeof processedWebhooks.$inferSelect;
export type NewProcessedWebhook = typeof processedWebhooks.$inferInsert;
