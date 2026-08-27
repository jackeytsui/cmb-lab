-- Keep automated GHL/progress enrollment grants out of the manual exception
-- list shown in the course editor. The three Blueprint arrays were populated
-- by the progress migration and hourly GHL reconciler.

ALTER TABLE "course_library_courses"
  ADD COLUMN IF NOT EXISTS "system_access_user_ids" jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE "course_library_courses"
SET "system_access_user_ids" = (
      SELECT COALESCE(jsonb_agg(user_id), '[]'::jsonb)
      FROM (
        SELECT DISTINCT user_id
        FROM jsonb_array_elements_text(
          COALESCE("system_access_user_ids", '[]'::jsonb) ||
          COALESCE("allowed_user_ids", '[]'::jsonb)
        ) AS ids(user_id)
      ) AS unique_ids
    ),
    "allowed_user_ids" = '[]'::jsonb,
    "updated_at" = NOW()
WHERE "deleted_at" IS NULL
  AND "title" IN (
    'The Canto to Mando Blueprint - Foundations',
    'The Canto to Mando Blueprint - Intermediate',
    'The Canto to Mando Blueprint - Advanced'
  )
  AND jsonb_array_length(COALESCE("allowed_user_ids", '[]'::jsonb)) > 0;
