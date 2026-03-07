CREATE TYPE "public"."upload_category" AS ENUM('lesson', 'prompt', 'other');--> statement-breakpoint
ALTER TABLE "video_prompts" ALTER COLUMN "video_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "video_uploads" ADD COLUMN "category" "upload_category" DEFAULT 'lesson' NOT NULL;--> statement-breakpoint
ALTER TABLE "video_uploads" ADD COLUMN "tags" text[];--> statement-breakpoint
ALTER TABLE "video_prompts" ADD COLUMN "upload_id" uuid;--> statement-breakpoint
ALTER TABLE "video_prompts" ADD CONSTRAINT "video_prompts_upload_id_video_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."video_uploads"("id") ON DELETE set null ON UPDATE no action;