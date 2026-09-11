CREATE TABLE IF NOT EXISTS "coaching_feedback_prompt_states" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "coaching_sessions"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "prompt_count" integer NOT NULL DEFAULT 0 CHECK ("prompt_count" >= 0),
  "last_prompted_at" timestamp,
  "skipped_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "coaching_feedback_prompt_session_user_idx"
  ON "coaching_feedback_prompt_states" ("session_id", "user_id");

CREATE INDEX IF NOT EXISTS "coaching_feedback_prompt_user_last_idx"
  ON "coaching_feedback_prompt_states" ("user_id", "last_prompted_at");
