CREATE TABLE IF NOT EXISTS "audio_lesson_notes" (
  "id" uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "lesson_id" uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "content" text NOT NULL DEFAULT '',
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "audio_lesson_notes_user_lesson_idx"
  ON "audio_lesson_notes" ("user_id", "lesson_id");
