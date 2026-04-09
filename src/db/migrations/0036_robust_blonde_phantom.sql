CREATE TYPE "public"."grant_type" AS ENUM('additive', 'deny');--> statement-breakpoint
CREATE TABLE "tag_content_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_feature_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"feature_key" text NOT NULL,
	"grant_type" "grant_type" DEFAULT 'additive' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accelerator_content_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content_key" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"chinese_text" text NOT NULL,
	"correct_pinyin" text NOT NULL,
	"wrong_pinyin1" text NOT NULL,
	"wrong_pinyin2" text NOT NULL,
	"wrong_pinyin3" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tone_mastery_clips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"pinyin" text NOT NULL,
	"chinese" text NOT NULL,
	"video_url" text NOT NULL,
	"group_number" integer NOT NULL,
	"item_number" integer NOT NULL,
	"variant" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tone_mastery_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"clip_id" uuid NOT NULL,
	"self_rating" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coaching_level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coaching_lesson_number" text;--> statement-breakpoint
ALTER TABLE "tag_content_grants" ADD CONSTRAINT "tag_content_grants_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_feature_grants" ADD CONSTRAINT "tag_feature_grants_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accelerator_content_completion" ADD CONSTRAINT "accelerator_content_completion_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_question_id_listening_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."listening_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tone_mastery_progress" ADD CONSTRAINT "tone_mastery_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tone_mastery_progress" ADD CONSTRAINT "tone_mastery_progress_clip_id_tone_mastery_clips_id_fk" FOREIGN KEY ("clip_id") REFERENCES "public"."tone_mastery_clips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tag_content_grants_unique" ON "tag_content_grants" USING btree ("tag_id","content_type","content_id");--> statement-breakpoint
CREATE INDEX "tag_content_grants_tag_id_idx" ON "tag_content_grants" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_content_grants_content_idx" ON "tag_content_grants" USING btree ("content_type","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_feature_grants_tag_feature_unique" ON "tag_feature_grants" USING btree ("tag_id","feature_key");--> statement-breakpoint
CREATE INDEX "tag_feature_grants_tag_id_idx" ON "tag_feature_grants" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "tag_feature_grants_feature_key_idx" ON "tag_feature_grants" USING btree ("feature_key");--> statement-breakpoint
CREATE UNIQUE INDEX "acc_content_completion_user_key_idx" ON "accelerator_content_completion" USING btree ("user_id","content_key");--> statement-breakpoint
CREATE INDEX "acc_content_completion_user_idx" ON "accelerator_content_completion" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "listening_progress_user_question_idx" ON "listening_progress" USING btree ("user_id","question_id");--> statement-breakpoint
CREATE INDEX "listening_progress_user_idx" ON "listening_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "listening_questions_sort_idx" ON "listening_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "tone_mastery_clips_group_idx" ON "tone_mastery_clips" USING btree ("group_number");--> statement-breakpoint
CREATE INDEX "tone_mastery_clips_sort_idx" ON "tone_mastery_clips" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "tone_mastery_progress_user_clip_idx" ON "tone_mastery_progress" USING btree ("user_id","clip_id");--> statement-breakpoint
CREATE INDEX "tone_mastery_progress_user_idx" ON "tone_mastery_progress" USING btree ("user_id");