-- Rename the numbered "Lesson N" MODULES in the Foundations and Intermediate
-- courses to include their roadmap topic (e.g. "Lesson 1" -> "Lesson 1:
-- Pronouns"), from each Section Roadmap.
--
-- These "Lesson 1 .. Lesson 13" entries are course_library_modules (not
-- lessons). Migrations 0064/0065 targeted the lessons table and were no-ops.
--
-- Scoped per course. Idempotent: matches modules whose title is still exactly
-- "Lesson N" (renamed titles no longer match), so re-running is a no-op.

-- Foundations
UPDATE "course_library_modules" AS m
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
WHERE lower(trim(m."title")) = lower(v.old_title)
  AND m."deleted_at" IS NULL
  AND m."course_id" IN (
    SELECT c."id" FROM "course_library_courses" c
    WHERE c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - foundations'
  );

-- Intermediate
UPDATE "course_library_modules" AS m
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
WHERE lower(trim(m."title")) = lower(v.old_title)
  AND m."deleted_at" IS NULL
  AND m."course_id" IN (
    SELECT c."id" FROM "course_library_courses" c
    WHERE c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - intermediate'
  );
