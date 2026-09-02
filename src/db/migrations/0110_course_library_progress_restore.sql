CREATE TABLE IF NOT EXISTS "course_library_progress_restore_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "decision" text NOT NULL,
  "selections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "course_library_progress_restore_decision_valid"
    CHECK ("decision" IN ('used', 'dismissed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_library_progress_restore_decisions_user_unique"
  ON "course_library_progress_restore_decisions" ("user_id");
