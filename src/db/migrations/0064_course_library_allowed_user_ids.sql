-- Per-student manual access grants for Course Library courses.
-- Used for customized ("Customized ...") courses, which are hidden from all
-- students by default; the team grants access per student in the course
-- editor's Visibility section — same model as audio series allowedUserIds.
-- Idempotent: safe to re-run.

ALTER TABLE "course_library_courses"
  ADD COLUMN IF NOT EXISTS "allowed_user_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
