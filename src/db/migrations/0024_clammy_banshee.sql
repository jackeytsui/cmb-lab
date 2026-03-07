CREATE TYPE "public"."srs_card_source" AS ENUM('manual', 'vocabulary', 'reader', 'practice', 'grammar', 'assessment');--> statement-breakpoint
CREATE TYPE "public"."srs_card_state" AS ENUM('new', 'learning', 'review', 'relearning');--> statement-breakpoint
CREATE TYPE "public"."srs_rating" AS ENUM('again', 'hard', 'good', 'easy');--> statement-breakpoint
CREATE TYPE "public"."grammar_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."tone_attempt_type" AS ENUM('identification', 'production', 'minimal_pair', 'sandhi');--> statement-breakpoint
CREATE TYPE "public"."tone_language" AS ENUM('mandarin', 'cantonese');--> statement-breakpoint
CREATE TYPE "public"."assessment_type" AS ENUM('placement', 'hsk_mock', 'custom');--> statement-breakpoint
CREATE TABLE "video_thread_session_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"message" text,
	"loom_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processed_webhooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"source" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb,
	"result" text NOT NULL,
	"result_data" jsonb,
	"processed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "processed_webhooks_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"deck_id" uuid,
	"source_type" "srs_card_source" DEFAULT 'manual' NOT NULL,
	"source_id" uuid,
	"traditional" text NOT NULL,
	"simplified" text,
	"pinyin" text,
	"jyutping" text,
	"meaning" text NOT NULL,
	"example" text,
	"state" "srs_card_state" DEFAULT 'new' NOT NULL,
	"due" timestamp DEFAULT now() NOT NULL,
	"stability" real DEFAULT 0.3 NOT NULL,
	"difficulty" real DEFAULT 5 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_review_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" "srs_rating" NOT NULL,
	"state_before" "srs_card_state" NOT NULL,
	"state_after" "srs_card_state" NOT NULL,
	"scheduled_days" integer NOT NULL,
	"elapsed_days" integer NOT NULL,
	"stability" real NOT NULL,
	"difficulty" real NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_bookmarks" (
	"user_id" uuid NOT NULL,
	"pattern_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grammar_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hsk_level" integer DEFAULT 1 NOT NULL,
	"category" text NOT NULL,
	"title" text NOT NULL,
	"pattern" text NOT NULL,
	"pinyin" text,
	"explanation" text NOT NULL,
	"examples" text[] DEFAULT '{}' NOT NULL,
	"translations" text[] DEFAULT '{}' NOT NULL,
	"mistakes" text[] DEFAULT '{}' NOT NULL,
	"cantonese_diff" text,
	"related_lesson_ids" text[] DEFAULT '{}' NOT NULL,
	"related_practice_set_ids" text[] DEFAULT '{}' NOT NULL,
	"status" "grammar_status" DEFAULT 'draft' NOT NULL,
	"ai_generated" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tone_practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" "tone_language" NOT NULL,
	"type" "tone_attempt_type" NOT NULL,
	"prompt" text NOT NULL,
	"expected_tone" integer,
	"selected_tone" integer,
	"is_correct" integer DEFAULT 0 NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"feedback" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"section_scores" jsonb,
	"estimated_hsk_level" integer,
	"answers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"skill_area" text DEFAULT 'vocabulary' NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"prompt" text NOT NULL,
	"type" text DEFAULT 'multiple_choice' NOT NULL,
	"definition" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"type" "assessment_type" DEFAULT 'custom' NOT NULL,
	"hsk_level" integer,
	"pass_threshold" integer DEFAULT 70 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_lab_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"input" text NOT NULL,
	"expected_pattern" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_lab_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"prompt_a" text NOT NULL,
	"prompt_b" text,
	"input" text NOT NULL,
	"output_a" text NOT NULL,
	"output_b" text,
	"pass_count" integer DEFAULT 0 NOT NULL,
	"total_cases" integer DEFAULT 0 NOT NULL,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "study_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"daily_minutes" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "role_courses_role_course_unique";--> statement-breakpoint
ALTER TABLE "role_courses" ADD COLUMN "module_id" uuid;--> statement-breakpoint
ALTER TABLE "role_courses" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "video_thread_session_reviews" ADD CONSTRAINT "video_thread_session_reviews_session_id_video_thread_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_thread_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_thread_session_reviews" ADD CONSTRAINT "video_thread_session_reviews_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_deck_id_srs_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."srs_decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_decks" ADD CONSTRAINT "srs_decks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_reviews" ADD CONSTRAINT "srs_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_bookmarks" ADD CONSTRAINT "grammar_bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_bookmarks" ADD CONSTRAINT "grammar_bookmarks_pattern_id_grammar_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."grammar_patterns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grammar_patterns" ADD CONSTRAINT "grammar_patterns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tone_practice_attempts" ADD CONSTRAINT "tone_practice_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempts" ADD CONSTRAINT "assessment_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_questions" ADD CONSTRAINT "assessment_questions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_lab_cases" ADD CONSTRAINT "prompt_lab_cases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_lab_runs" ADD CONSTRAINT "prompt_lab_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "study_preferences" ADD CONSTRAINT "study_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_thread_session_reviews_session_idx" ON "video_thread_session_reviews" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "video_thread_session_reviews_coach_idx" ON "video_thread_session_reviews" USING btree ("coach_id");--> statement-breakpoint
CREATE INDEX "processed_webhooks_processed_at_idx" ON "processed_webhooks" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "srs_cards_user_id_idx" ON "srs_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "srs_cards_due_idx" ON "srs_cards" USING btree ("due");--> statement-breakpoint
CREATE INDEX "srs_cards_deck_id_idx" ON "srs_cards" USING btree ("deck_id");--> statement-breakpoint
CREATE INDEX "srs_decks_user_id_idx" ON "srs_decks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_card_id_idx" ON "srs_reviews" USING btree ("card_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_user_id_idx" ON "srs_reviews" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "srs_reviews_reviewed_at_idx" ON "srs_reviews" USING btree ("reviewed_at");--> statement-breakpoint
CREATE INDEX "grammar_bookmarks_user_id_idx" ON "grammar_bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "grammar_bookmarks_pattern_id_idx" ON "grammar_bookmarks" USING btree ("pattern_id");--> statement-breakpoint
CREATE INDEX "grammar_patterns_hsk_level_idx" ON "grammar_patterns" USING btree ("hsk_level");--> statement-breakpoint
CREATE INDEX "grammar_patterns_category_idx" ON "grammar_patterns" USING btree ("category");--> statement-breakpoint
CREATE INDEX "grammar_patterns_status_idx" ON "grammar_patterns" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tone_practice_attempts_user_id_idx" ON "tone_practice_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tone_practice_attempts_created_at_idx" ON "tone_practice_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "assessment_attempts_assessment_id_idx" ON "assessment_attempts" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessment_attempts_user_id_idx" ON "assessment_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assessment_questions_assessment_id_idx" ON "assessment_questions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "assessments_type_idx" ON "assessments" USING btree ("type");--> statement-breakpoint
CREATE INDEX "prompt_lab_cases_user_id_idx" ON "prompt_lab_cases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prompt_lab_runs_user_id_idx" ON "prompt_lab_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "prompt_lab_runs_created_at_idx" ON "prompt_lab_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "study_preferences_daily_minutes_idx" ON "study_preferences" USING btree ("daily_minutes");--> statement-breakpoint
ALTER TABLE "role_courses" ADD CONSTRAINT "role_courses_module_id_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."modules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_courses" ADD CONSTRAINT "role_courses_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "role_courses_unique" ON "role_courses" USING btree ("role_id","course_id","module_id","lesson_id");