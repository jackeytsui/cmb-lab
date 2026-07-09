-- Cantonese assignment lesson types.
--
-- Duplicates the four Course Library assignment types for Cantonese courses:
-- Text Assignment, Listening Practice, Vocal Hack, and Diary. They behave
-- exactly like their Mandarin counterparts, except the romanisation is jyutping
-- (via to-jyutping), the English is translated from Cantonese (zh-HK), and TTS
-- uses zh-HK — mirroring the 1:1 coaching "Cantonese input".
--
-- Only NEW course_library_lesson_type enum values are needed. Submissions still
-- map to the existing assignment_type_kind values (text_assignment / vocal_hack
-- / diary) so the existing reviewer roles (Challenge / Vocal Hack / Diary
-- Reviewer) cover both languages — no new roles, columns, or type_kind values.
-- Idempotent (guarded ADD VALUE), one value per DO block.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'text_assignment_canto'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'text_assignment_canto';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'listening_practice_canto'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'listening_practice_canto';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'vocal_hack_canto'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'vocal_hack_canto';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'diary_canto'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'diary_canto';
  END IF;
END $$;
