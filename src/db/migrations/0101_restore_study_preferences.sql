-- Production baselined the legacy 0024 migration without applying it, so the
-- study dashboard was querying a table that did not exist. Re-create this one
-- legacy table idempotently in the tracked migration range.
CREATE TABLE IF NOT EXISTS "study_preferences" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "daily_minutes" integer DEFAULT 30 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "study_preferences"
    ADD CONSTRAINT "study_preferences_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "study_preferences_daily_minutes_idx"
  ON "study_preferences" ("daily_minutes");
