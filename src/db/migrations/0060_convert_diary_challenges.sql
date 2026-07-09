-- Convert the existing "Diary Challenge N" lessons in the Intermediate and
-- Advanced courses from Text lessons to the Diary lesson type, keeping their
-- titles and replacing the content with the standard default diary
-- instructions (Mandarin variant — same HTML the create-lesson route pre-fills).
--
-- Scope is deliberately tight and idempotent:
--   - only lessons still typed 'text' (re-running this is a no-op once converted)
--   - only titles containing "diary"
--   - only inside courses titled Intermediate / Advanced
-- so it targets exactly the 13 + 13 diary challenges and nothing else.

UPDATE "course_library_lessons" AS l
SET
  "lesson_type" = 'diary',
  "content" = jsonb_build_object(
    'description',
    '<p>Writing a diary is a great way to express yourself. Using Chinese to write one can also improve your sentence structure, word choice, and pronunciation! It might seem challenging at first, but I am sure you''ll improve with practice. Start with <strong>3-4 short sentences</strong>, then try more complex structures and content later.</p><p></p><p>*Keep it to a <strong>maximum of 15 sentences</strong> as you only have <strong>5 minutes to record</strong> your diary.</p><p></p><p>Here are some ideas/ inspirations for you to write your diary:</p><p></p><ul><li>What did you eat today?</li><li>Describe your morning routine.</li><li>Talk about your favorite hobby.</li><li>Share a memorable moment from last week.</li><li>Describe a place you visited recently.</li><li>Discuss a book or movie you enjoyed.</li><li>Describe your plans for the upcoming weekend.</li><li>Talk about a goal you''ve set for yourself.</li><li>Describe a recent challenge you''ve overcome.</li><li>Share your thoughts on learning Mandarin.</li></ul><p></p><p>Our coaches will provide feedback!</p>'
  ),
  "updated_at" = now()
WHERE l."lesson_type" = 'text'
  AND l."deleted_at" IS NULL
  AND l."title" ILIKE '%diary%'
  AND l."module_id" IN (
    SELECT m."id"
    FROM "course_library_modules" m
    JOIN "course_library_courses" c ON c."id" = m."course_id"
    WHERE m."deleted_at" IS NULL
      AND c."deleted_at" IS NULL
      AND lower(c."title") IN ('intermediate', 'advanced')
  );
