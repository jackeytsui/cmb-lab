ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "coaching_goals" text;

-- Migrate existing per-session goals to the student's user record.
-- For each student email, pick the most recently updated session's goals.
UPDATE "users" u
SET "coaching_goals" = sub.goals
FROM (
  SELECT DISTINCT ON (cs."student_email")
    cs."student_email",
    cs."goals"
  FROM "coaching_sessions" cs
  WHERE cs."goals" IS NOT NULL
    AND cs."student_email" IS NOT NULL
  ORDER BY cs."student_email", cs."updated_at" DESC
) sub
WHERE u."email" = sub."student_email"
  AND u."coaching_goals" IS NULL;
