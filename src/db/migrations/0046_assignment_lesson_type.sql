-- Assignment lesson type: adds lesson_type and confirmation_message columns.
-- lesson_type: 'standard' (default) or 'assignment' (vocal hack, challenge, survey)
-- confirmation_message: optional text shown to student after completing an assignment
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "lesson_type" text NOT NULL DEFAULT 'standard';
ALTER TABLE "lessons" ADD COLUMN IF NOT EXISTS "confirmation_message" text;
