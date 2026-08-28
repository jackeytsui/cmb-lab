ALTER TABLE "group_coaching_event_reminders"
  ADD COLUMN IF NOT EXISTS "occurrence_starts_at" timestamp with time zone;

UPDATE "group_coaching_event_reminders" AS reminder
SET "occurrence_starts_at" = event."starts_at"
FROM "group_coaching_events" AS event
WHERE reminder."event_id" = event."id"
  AND reminder."occurrence_starts_at" IS NULL;

ALTER TABLE "group_coaching_event_reminders"
  ALTER COLUMN "occurrence_starts_at" SET NOT NULL;

DROP INDEX IF EXISTS "group_coaching_reminders_event_user_key_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "group_coaching_reminders_event_user_occurrence_key_unique"
  ON "group_coaching_event_reminders" (
    "event_id",
    "user_id",
    "occurrence_starts_at",
    "reminder_key"
  );
