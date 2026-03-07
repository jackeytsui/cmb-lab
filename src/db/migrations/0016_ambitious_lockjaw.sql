ALTER TYPE "public"."interaction_type" ADD VALUE 'video';--> statement-breakpoint
ALTER TYPE "public"."submission_type" ADD VALUE 'video';--> statement-breakpoint
-- CREATE TABLE "lesson_attachments" (
-- 	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
-- 	"lesson_id" uuid NOT NULL,
-- 	"title" text NOT NULL,
-- 	"url" text NOT NULL,
-- 	"type" text DEFAULT 'link' NOT NULL,
-- 	"sort_order" integer DEFAULT 0 NOT NULL,
-- 	"created_at" timestamp DEFAULT now() NOT NULL,
-- 	"updated_at" timestamp DEFAULT now() NOT NULL
-- );
--> statement-breakpoint
CREATE TABLE "video_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"video_url" text NOT NULL,
	"transcript" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interactions" ADD COLUMN "video_prompt_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "video_url" text;--> statement-breakpoint
-- ALTER TABLE "lesson_attachments" ADD CONSTRAINT "lesson_attachments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_prompts" ADD CONSTRAINT "video_prompts_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- CREATE INDEX "lesson_attachments_lesson_id_idx" ON "lesson_attachments" USING btree ("lesson_id");--> statement-breakpoint
CREATE INDEX "video_prompts_coach_id_idx" ON "video_prompts" USING btree ("coach_id");--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_video_prompt_id_video_prompts_id_fk" FOREIGN KEY ("video_prompt_id") REFERENCES "public"."video_prompts"("id") ON DELETE no action ON UPDATE no action;