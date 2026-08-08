-- Team feature request: explicit assignment-feedback entitlement, persistent
-- video-lesson typing notes, and tag-targeted group coaching events.

ALTER TABLE "assignment_submissions"
  ADD COLUMN IF NOT EXISTS "feedback_requested" boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "assignment_submissions_feedback_requested_idx"
  ON "assignment_submissions" ("feedback_requested");

CREATE TABLE IF NOT EXISTS "course_library_lesson_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "lesson_id" uuid NOT NULL REFERENCES "course_library_lessons"("id") ON DELETE cascade,
  "content" text NOT NULL DEFAULT '',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "course_library_lesson_notes_user_lesson_unique"
  ON "course_library_lesson_notes" ("user_id", "lesson_id");
CREATE INDEX IF NOT EXISTS "course_library_lesson_notes_lesson_idx"
  ON "course_library_lesson_notes" ("lesson_id");

CREATE TABLE IF NOT EXISTS "group_coaching_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "title" text NOT NULL,
  "description" text NOT NULL DEFAULT '',
  "host_name" text NOT NULL DEFAULT '',
  "starts_at" timestamptz NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 60,
  "meeting_url" text NOT NULL,
  "is_cancelled" boolean NOT NULL DEFAULT false,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "group_coaching_events_starts_at_idx"
  ON "group_coaching_events" ("starts_at");

-- Human feedback belongs to the full CMB and Inner Circle cohorts. It is not
-- a default-student feature, so whitelisted/no-package tiers do not inherit it.
INSERT INTO "tag_feature_grants" ("tag_id", "feature_key", "grant_type")
SELECT "id", 'assignment_feedback', 'additive'
FROM "tags"
WHERE "name" IN ('cmb_student', 'ic_student')
ON CONFLICT ("tag_id", "feature_key") DO UPDATE
SET "grant_type" = EXCLUDED."grant_type";
