-- Notepad persistence: one row per (user, pane).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "notepad_entries" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pane" text NOT NULL,
  "text" text NOT NULL DEFAULT '',
  "script_mode" text NOT NULL DEFAULT 'simplified',
  "font_size" integer NOT NULL DEFAULT 32,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "notepad_entries_user_pane_pk" PRIMARY KEY ("user_id", "pane")
);
