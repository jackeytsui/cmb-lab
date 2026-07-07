-- Course Library course visibility status: draft / preview / published.
-- `preview` is visible only to staff (admin/coach) for review before launch.
-- Backfills status from the existing is_published boolean; is_published is
-- kept in sync (true iff status = 'published') for backward compatibility.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'course_library_course_status'
  ) THEN
    CREATE TYPE "course_library_course_status" AS ENUM ('draft', 'preview', 'published');
  END IF;
END $$;

ALTER TABLE "course_library_courses"
  ADD COLUMN IF NOT EXISTS "status" "course_library_course_status"
  NOT NULL DEFAULT 'draft';

-- Backfill from is_published for existing rows.
UPDATE "course_library_courses"
  SET "status" = CASE WHEN "is_published" THEN 'published'::"course_library_course_status"
                      ELSE 'draft'::"course_library_course_status" END
  WHERE "status" = 'draft';

CREATE INDEX IF NOT EXISTS "course_library_courses_status_idx"
  ON "course_library_courses" ("status");
