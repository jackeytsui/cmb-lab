-- CMB Assignment Types: adds assignment_config to lessons + new lesson_submissions/lesson_reviews tables.
-- lesson_submissions: one per (lesson, user), stores type-specific submission JSON.
-- lesson_reviews: one per submission, stores coach feedback JSON + notification timestamp.
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "assignment_config" text;

CREATE TABLE IF NOT EXISTS "lesson_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lesson_id" uuid NOT NULL REFERENCES "lessons"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "submission_data" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "lesson_submissions_lesson_user_idx" ON "lesson_submissions"("lesson_id", "user_id");
CREATE INDEX IF NOT EXISTS "lesson_submissions_lesson_id_idx" ON "lesson_submissions"("lesson_id");
CREATE INDEX IF NOT EXISTS "lesson_submissions_user_id_idx" ON "lesson_submissions"("user_id");
CREATE INDEX IF NOT EXISTS "lesson_submissions_status_idx" ON "lesson_submissions"("status");

CREATE TABLE IF NOT EXISTS "lesson_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id" uuid NOT NULL UNIQUE REFERENCES "lesson_submissions"("id") ON DELETE CASCADE,
  "reviewed_by" uuid NOT NULL REFERENCES "users"("id"),
  "review_data" text NOT NULL,
  "notified_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "lesson_reviews_submission_id_idx" ON "lesson_reviews"("submission_id");
