ALTER TABLE "video_thread_steps" ADD COLUMN IF NOT EXISTS "media_type" text;
--> statement-breakpoint
ALTER TABLE "video_thread_steps" ADD COLUMN IF NOT EXISTS "source_thumbnail_url" text;
--> statement-breakpoint
ALTER TABLE "video_thread_steps" ADD COLUMN IF NOT EXISTS "transcript_text" text;
