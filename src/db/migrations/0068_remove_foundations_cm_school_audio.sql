-- Remove the "audio" lessons from every "CM School" module in the
-- Foundations course.
--
-- Soft delete (sets deleted_at) — the same mechanism the admin "delete lesson"
-- button uses, so it hides the lessons from every query and can be undone if
-- needed. Scoped to audio-type lessons in modules whose title contains
-- "CM School", in "The Canto to Mando Blueprint - Foundations" only.
-- Idempotent: already-deleted rows are skipped, so re-running is a no-op.

UPDATE "course_library_lessons" AS l
SET "deleted_at" = now(),
    "updated_at" = now()
WHERE l."lesson_type" = 'audio'
  AND l."deleted_at" IS NULL
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - foundations'
      AND m."title" ILIKE '%cm school%'
  );
