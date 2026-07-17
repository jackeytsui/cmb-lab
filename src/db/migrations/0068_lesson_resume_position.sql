-- "Remember where you left off" (Netflix-style resume) for lesson videos.
-- Stores each student's last playback position (in whole seconds) per lesson
-- so the player can resume from where they stopped watching.
--
-- Additive and idempotent: nullable-safe with a 0 default so existing
-- lesson_progress rows keep working and a brand-new student simply starts
-- from the beginning. Safe to re-run.

ALTER TABLE "lesson_progress"
  ADD COLUMN IF NOT EXISTS "last_position_seconds" integer NOT NULL DEFAULT 0;
