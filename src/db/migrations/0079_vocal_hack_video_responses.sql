-- Preserve whether a native Vocal Hack response was recorded as audio or video.
-- Existing rows are audio and retain their current behavior.
ALTER TABLE "assignment_submission_sentences"
  ADD COLUMN IF NOT EXISTS "response_media_type" text DEFAULT 'audio' NOT NULL;
--> statement-breakpoint
UPDATE "assignment_submission_sentences"
SET "response_media_type" = 'audio'
WHERE "response_media_type" IS NULL
   OR "response_media_type" NOT IN ('audio', 'video');
