-- Course map (Duolingo-style roadmap) fields on course_library_modules.
--
-- 1. Adds course_library_module_map_style enum (idempotent).
-- 2. Adds short_title / map_style / week_label columns to
--    course_library_modules:
--    - short_title: shortened title shown on the student roadmap stop
--      (falls back to title when NULL).
--    - map_style: visual style of the roadmap stop
--      (lesson = dark blue, cm_school = light blue, custom_goal = yellow).
--    - week_label: optional section band label (e.g. "Week 1"); when it
--      differs from the previous module's label the map starts a new band.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'course_library_module_map_style'
  ) THEN
    CREATE TYPE "course_library_module_map_style" AS ENUM (
      'lesson',
      'cm_school',
      'custom_goal'
    );
  END IF;
END $$;

ALTER TABLE "course_library_modules"
  ADD COLUMN IF NOT EXISTS "short_title" text;

ALTER TABLE "course_library_modules"
  ADD COLUMN IF NOT EXISTS "map_style" "course_library_module_map_style" NOT NULL DEFAULT 'lesson';

ALTER TABLE "course_library_modules"
  ADD COLUMN IF NOT EXISTS "week_label" text;
