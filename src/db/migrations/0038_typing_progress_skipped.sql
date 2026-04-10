ALTER TABLE "typing_progress" ADD COLUMN IF NOT EXISTS "skipped" boolean NOT NULL DEFAULT false;
