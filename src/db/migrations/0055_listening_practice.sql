-- Listening Practice lesson type.
--
-- Adds 'listening_practice' to the course_library_lesson_type enum (idempotent).
-- No new tables: sentence content lives in course_library_lessons.content
-- (jsonb), and per-student scores reuse course_library_lesson_progress
-- (quiz_score = percentage, quiz_answers = per-sentence results).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'listening_practice'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'listening_practice';
  END IF;
END $$;
