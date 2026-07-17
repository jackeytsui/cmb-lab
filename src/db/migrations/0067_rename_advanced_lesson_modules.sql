-- Rename the numbered "Lesson N" MODULES in the Advanced course to include
-- their roadmap topic (e.g. "Lesson 1" -> "Lesson 1: Expressing Ability"),
-- from the Advanced Section Roadmap. Same approach as 0066.
--
-- Scoped to the Advanced course. Idempotent: matches modules whose title is
-- still exactly "Lesson N" (renamed titles no longer match), so re-running is
-- a no-op.

UPDATE "course_library_modules" AS m
SET "title" = v.new_title,
    "updated_at" = now()
FROM (VALUES
  ('Lesson 1',  'Lesson 1: Expressing Ability'),
  ('Lesson 2',  'Lesson 2: 才 "cái"'),
  ('Lesson 3',  'Lesson 3: Causative Verbs'),
  ('Lesson 4',  'Lesson 4: 把 "bǎ"'),
  ('Lesson 5',  'Lesson 5: Expressing Distance'),
  ('Lesson 6',  'Lesson 6: Understanding'),
  ('Lesson 7',  'Lesson 7: "Always"'),
  ('Lesson 8',  'Lesson 8: Always and Never'),
  ('Lesson 9',  'Lesson 9: Time Duration'),
  ('Lesson 10', 'Lesson 10: Conjunctions III'),
  ('Lesson 11', 'Lesson 11: Continuous Action'),
  ('Lesson 12', 'Lesson 12: Complements'),
  ('Lesson 13', 'Lesson 13: The Three "De"s')
) AS v(old_title, new_title)
WHERE lower(trim(m."title")) = lower(v.old_title)
  AND m."deleted_at" IS NULL
  AND m."course_id" IN (
    SELECT c."id" FROM "course_library_courses" c
    WHERE c."deleted_at" IS NULL
      AND lower(trim(c."title")) = 'the canto to mando blueprint - advanced'
  );
