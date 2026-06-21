-- Add 'form' lesson type to course_library_lesson_type enum (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'form'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'form';
  END IF;
END $$;
