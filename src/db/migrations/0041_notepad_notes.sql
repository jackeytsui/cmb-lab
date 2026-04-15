-- Notepad notes list (per-user saved notes, grouped by pane).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "notepad_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pane" text NOT NULL,
  "text" text NOT NULL,
  "order" integer NOT NULL DEFAULT 0,
  "starred" integer NOT NULL DEFAULT 0,
  "text_override" text,
  "romanization_override" text,
  "translation_override" text,
  "explanation" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "notepad_notes_user_pane_idx"
  ON "notepad_notes" ("user_id", "pane");
