-- Add short topic titles to the 13 numbered lessons in
-- "The Canto to Mando Blueprint - Foundations", matching the
-- Foundation Section Roadmap (e.g. "Lesson 1" -> "Lesson 1: Pronouns").
--
-- Scoped to that course only. Idempotent: matches lessons whose title is
-- still exactly "Lesson N" (the renamed titles no longer match), so
-- re-running is a no-op.

UPDATE "course_library_lessons" AS l
SET "title" = v.new_title,
    "updated_at" = now()
FROM (VALUES
  ('Lesson 1',  'Lesson 1: Pronouns'),
  ('Lesson 2',  'Lesson 2: Possession'),
  ('Lesson 3',  'Lesson 3: Negating'),
  ('Lesson 4',  'Lesson 4: Verb Actions'),
  ('Lesson 5',  'Lesson 5: "What"'),
  ('Lesson 6',  'Lesson 6: Indicator Words'),
  ('Lesson 7',  'Lesson 7: Location Words'),
  ('Lesson 8',  'Lesson 8: "To Be"'),
  ('Lesson 9',  'Lesson 9: Indicating Time I'),
  ('Lesson 10', 'Lesson 10: Indicating Time II'),
  ('Lesson 11', 'Lesson 11: Asking Questions I'),
  ('Lesson 12', 'Lesson 12: Asking Questions II'),
  ('Lesson 13', 'Lesson 13: Asking Questions III')
) AS v(old_title, new_title)
WHERE lower(trim(l."title")) = lower(v.old_title)
  AND l."deleted_at" IS NULL
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - foundations'
  );
