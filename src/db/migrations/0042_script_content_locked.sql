-- Add content_locked flag to conversation_scripts.
-- When true, the PUT and DELETE admin API routes reject changes,
-- protecting uploaded audio, custom romanisation, and script text.
-- Idempotent: safe to re-run.

ALTER TABLE "conversation_scripts"
  ADD COLUMN IF NOT EXISTS "content_locked" boolean NOT NULL DEFAULT false;
