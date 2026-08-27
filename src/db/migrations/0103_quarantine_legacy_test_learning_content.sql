-- Quarantine early seed/test content that was left published in production.
-- Preserve all exercises, assignments, and attempts for audit/recovery; only
-- remove the content from active course and practice-set surfaces.

UPDATE "practice_sets"
SET "status" = 'archived',
    "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND (
    ("id" = 'f1164b9f-79ae-4727-9c2b-bd45e513cfa5'
      AND "title" = 'Lesson 2 Quiz')
    OR
    ("id" = '7f9db196-d82e-41f3-91f3-d9404528a9ce'
      AND "title" = 'Lesson 1: Hello Quiz')
  )
  AND "status" = 'published';

UPDATE "courses"
SET "is_published" = FALSE,
    "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND (
    ("id" = '11111111-1111-1111-1111-111111111111'
      AND "title" = 'Beginner Cantonese')
    OR
    ("id" = '5556673f-97b3-45d0-a9ca-15a5d247f829'
      AND "title" = 'Test Course 1')
  )
  AND "is_published" = TRUE;
