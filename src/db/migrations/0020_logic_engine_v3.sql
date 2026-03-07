ALTER TABLE "video_thread_steps" ADD COLUMN "logic_rules" jsonb;--> statement-breakpoint
ALTER TABLE "video_thread_steps" ADD COLUMN "fallback_step_id" uuid;