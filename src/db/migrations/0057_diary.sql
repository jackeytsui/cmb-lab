-- Diary lesson type: students write a short paragraph (pinyin/English generated,
-- reviewer-correctable like a text assignment) and submit an audio recording of
-- themselves reading it, for human review.
--
-- 1. Adds 'diary' to course_library_lesson_type (idempotent).
-- 2. Adds 'diary' to assignment_type_kind (idempotent).
-- 3. Adds student_audio_url to assignment_submissions (the student's own
--    recording; distinct from recording_url, the reviewer's Loom link).
-- 4. Seeds the "Diary Reviewer" role bundle granting assignment_review_diary
--    (additive with Coach, same pattern as Challenge / Vocal Hack Reviewer).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'diary'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'diary';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'diary'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'assignment_type_kind'
      )
  ) THEN
    ALTER TYPE "assignment_type_kind" ADD VALUE 'diary';
  END IF;
END $$;

ALTER TABLE "assignment_submissions"
  ADD COLUMN IF NOT EXISTS "student_audio_url" text;

INSERT INTO "roles" ("name", "description", "color")
VALUES (
  'Diary Reviewer',
  'Can review student Diary submissions (written entry + audio).',
  '#0ea5e9'
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_features" ("role_id", "feature_key")
SELECT "id", 'assignment_review_diary' FROM "roles" WHERE "name" = 'Diary Reviewer'
ON CONFLICT ("role_id", "feature_key") DO NOTHING;
