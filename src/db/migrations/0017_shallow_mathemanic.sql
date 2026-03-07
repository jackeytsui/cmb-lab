ALTER TYPE "public"."exercise_type" ADD VALUE 'video_recording';--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD COLUMN "answers" jsonb;