CREATE TABLE IF NOT EXISTS "group_coaching_event_reminders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL REFERENCES "group_coaching_events"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reminder_key" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "group_coaching_reminders_event_user_key_unique"
  ON "group_coaching_event_reminders" ("event_id", "user_id", "reminder_key");

CREATE INDEX IF NOT EXISTS "group_coaching_reminders_event_idx"
  ON "group_coaching_event_reminders" ("event_id");
