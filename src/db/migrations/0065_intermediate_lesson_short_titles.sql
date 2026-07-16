-- Add short topic titles to the 13 numbered lessons in
-- "The Canto to Mando Blueprint - Intermediate", matching the
-- Intermediate Section Roadmap (e.g. "Lesson 1" -> "Lesson 1: \"This Way\"").
--
-- Scoped to that course only. Idempotent: matches lessons whose title is
-- still exactly "Lesson N" (the renamed titles no longer match), so
-- re-running is a no-op.

UPDATE "course_library_lessons" AS l
SET "title" = v.new_title,
    "updated_at" = now()
FROM (VALUES
  ('Lesson 1',  'Lesson 1: "This Way"'),
  ('Lesson 2',  'Lesson 2: "Like This"'),
  ('Lesson 3',  'Lesson 3: Negating Everything'),
  ('Lesson 4',  'Lesson 4: 了 "le" Fully Explained'),
  ('Lesson 5',  'Lesson 5: "Only"'),
  ('Lesson 6',  'Lesson 6: "All"'),
  ('Lesson 7',  'Lesson 7: Time Phrases'),
  ('Lesson 8',  'Lesson 8: 吧 "ba" for Suggestions'),
  ('Lesson 9',  'Lesson 9: Comparisons'),
  ('Lesson 10', 'Lesson 10: Passive Voice'),
  ('Lesson 11', 'Lesson 11: Conjunctions I'),
  ('Lesson 12', 'Lesson 12: Conjunctions II'),
  ('Lesson 13', 'Lesson 13: Asking Questions IV')
) AS v(old_title, new_title)
WHERE lower(trim(l."title")) = lower(v.old_title)
  AND l."deleted_at" IS NULL
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - intermediate'
  );
