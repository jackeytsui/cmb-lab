-- Vocal Hack lesson type: students watch a coach video per sentence, record
-- themselves reading it, and submit for human review.
--
-- 1. Adds 'vocal_hack' to course_library_lesson_type (idempotent).
-- 2. Adds 'vocal_hack' to assignment_type_kind (idempotent).
-- 3. Adds vocal-hack columns to assignment_submission_sentences:
--    audio_url (student recording) + corrected_chinese/pinyin/english
--    (reviewer's corrected sentence).
-- 4. Seeds the "Vocal Hack Reviewer" role bundle granting the
--    assignment_review_vocal capability (additive with Coach, same pattern
--    as Challenge Reviewer).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'vocal_hack'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'vocal_hack';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'vocal_hack'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'assignment_type_kind'
      )
  ) THEN
    ALTER TYPE "assignment_type_kind" ADD VALUE 'vocal_hack';
  END IF;
END $$;

ALTER TABLE "assignment_submission_sentences"
  ADD COLUMN IF NOT EXISTS "audio_url" text,
  ADD COLUMN IF NOT EXISTS "corrected_chinese" text,
  ADD COLUMN IF NOT EXISTS "corrected_pinyin" text,
  ADD COLUMN IF NOT EXISTS "corrected_english" text;

-- Seed the Vocal Hack Reviewer role bundle (assignable alongside Coach).
INSERT INTO "roles" ("name", "description", "color")
VALUES (
  'Vocal Hack Reviewer',
  'Can review student Vocal Hack audio submissions.',
  '#8b5cf6'
)
ON CONFLICT ("name") DO NOTHING;

INSERT INTO "role_features" ("role_id", "feature_key")
SELECT "id", 'assignment_review_vocal' FROM "roles" WHERE "name" = 'Vocal Hack Reviewer'
ON CONFLICT ("role_id", "feature_key") DO NOTHING;
