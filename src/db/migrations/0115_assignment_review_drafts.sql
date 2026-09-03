ALTER TABLE "assignment_submissions"
ADD COLUMN IF NOT EXISTS "review_draft" jsonb;

ALTER TABLE "assignment_submissions"
ADD COLUMN IF NOT EXISTS "review_draft_saved_at" timestamp;

ALTER TABLE "assignment_submissions"
ADD COLUMN IF NOT EXISTS "review_draft_reviewer_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assignment_submissions_review_draft_reviewer_id_users_id_fk'
  ) THEN
    ALTER TABLE "assignment_submissions"
    ADD CONSTRAINT "assignment_submissions_review_draft_reviewer_id_users_id_fk"
    FOREIGN KEY ("review_draft_reviewer_id") REFERENCES "users"("id")
    ON DELETE SET NULL;
  END IF;
END $$;
