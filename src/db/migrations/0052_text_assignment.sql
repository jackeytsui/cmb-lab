-- Text Assignment lesson type + assignment submission/review tables.
--
-- 1. Adds 'text_assignment' to course_library_lesson_type enum (idempotent).
-- 2. Creates assignment_type_kind / assignment_submission_status /
--    assignment_sentence_verdict enums.
-- 3. Creates assignment_submissions, assignment_submission_sentences,
--    assignment_corrections tables.
-- 4. Seeds the "Challenge Reviewer" role bundle granting the
--    assignment_review_text capability (additive with Coach — role bundles
--    are many-to-many via user_roles).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'text_assignment'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'text_assignment';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_type_kind') THEN
    CREATE TYPE "assignment_type_kind" AS ENUM ('text_assignment');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_submission_status') THEN
    CREATE TYPE "assignment_submission_status" AS ENUM ('draft', 'submitted', 'assigned', 'in_review', 'reviewed');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'assignment_sentence_verdict') THEN
    CREATE TYPE "assignment_sentence_verdict" AS ENUM ('correct', 'needs_correction');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "assignment_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "lesson_id" uuid NOT NULL REFERENCES "course_library_lessons"("id") ON DELETE CASCADE,
  "module_id" uuid REFERENCES "course_library_modules"("id") ON DELETE SET NULL,
  "course_id" uuid REFERENCES "course_library_courses"("id") ON DELETE SET NULL,
  "student_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "assignment_type" "assignment_type_kind" NOT NULL DEFAULT 'text_assignment',
  "status" "assignment_submission_status" NOT NULL DEFAULT 'draft',
  "assigned_reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "submitted_at" timestamp,
  "review_started_at" timestamp,
  "reviewed_at" timestamp,
  "auto_score" integer,
  "final_score" integer,
  "score_overridden" boolean NOT NULL DEFAULT false,
  "recording_url" text,
  "extra_comment" text,
  "student_viewed_at" timestamp,
  "metadata" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "assignment_submissions_lesson_student_unique"
  ON "assignment_submissions"("lesson_id", "student_id");
CREATE INDEX IF NOT EXISTS "assignment_submissions_student_idx"
  ON "assignment_submissions"("student_id");
CREATE INDEX IF NOT EXISTS "assignment_submissions_status_idx"
  ON "assignment_submissions"("status");
CREATE INDEX IF NOT EXISTS "assignment_submissions_assigned_reviewer_idx"
  ON "assignment_submissions"("assigned_reviewer_id");
CREATE INDEX IF NOT EXISTS "assignment_submissions_course_idx"
  ON "assignment_submissions"("course_id");

CREATE TABLE IF NOT EXISTS "assignment_submission_sentences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "submission_id" uuid NOT NULL REFERENCES "assignment_submissions"("id") ON DELETE CASCADE,
  "prompt_id" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "prompt_label" text NOT NULL DEFAULT '',
  "prompt_description" text NOT NULL DEFAULT '',
  "chinese_text" text NOT NULL,
  "generated_pinyin" text NOT NULL DEFAULT '',
  "generated_english" text NOT NULL DEFAULT '',
  "review_verdict" "assignment_sentence_verdict",
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "assignment_submission_sentences_submission_prompt_unique"
  ON "assignment_submission_sentences"("submission_id", "prompt_id");
CREATE INDEX IF NOT EXISTS "assignment_submission_sentences_submission_idx"
  ON "assignment_submission_sentences"("submission_id");

CREATE TABLE IF NOT EXISTS "assignment_corrections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "sentence_id" uuid NOT NULL REFERENCES "assignment_submission_sentences"("id") ON DELETE CASCADE,
  "start_offset" integer NOT NULL,
  "end_offset" integer NOT NULL,
  "original_text" text NOT NULL,
  "suggested_chinese" text NOT NULL,
  "suggested_pinyin" text NOT NULL DEFAULT '',
  "suggested_english" text NOT NULL DEFAULT '',
  "note" text,
  "created_by_reviewer_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "assignment_corrections_sentence_idx"
  ON "assignment_corrections"("sentence_id");

-- Seed the Challenge Reviewer role bundle (assignable alongside Coach).
INSERT INTO "roles" ("name", "description", "color")
VALUES (
  'Challenge Reviewer',
  'Can review student assignment submissions (text assignments).',
  '#22c55e'
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_features" ("role_id", "feature_key")
SELECT "id", 'assignment_review_text' FROM "roles" WHERE "name" = 'Challenge Reviewer'
ON CONFLICT ("role_id", "feature_key") DO NOTHING;
