CREATE TYPE "public"."typing_language" AS ENUM('mandarin', 'cantonese');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_lesson_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"speaker_role" text NOT NULL,
	"responder_role" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curated_passages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passage_read_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"passage_id" uuid NOT NULL,
	"read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_line_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"self_rating" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "script_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"script_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"role" text NOT NULL,
	"cantonese_text" text NOT NULL,
	"mandarin_text" text NOT NULL,
	"cantonese_romanisation" text NOT NULL,
	"mandarin_romanisation" text NOT NULL,
	"english_text" text NOT NULL,
	"cantonese_audio_url" text,
	"mandarin_audio_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "typing_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"sentence_id" uuid NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "typing_sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"language" "typing_language" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"chinese_text" text NOT NULL,
	"english_text" text NOT NULL,
	"romanisation" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "coaching_goals" text;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD COLUMN "goals" text;--> statement-breakpoint
ALTER TABLE "audio_lesson_notes" ADD CONSTRAINT "audio_lesson_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_lesson_notes" ADD CONSTRAINT "audio_lesson_notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_scripts" ADD CONSTRAINT "conversation_scripts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curated_passages" ADD CONSTRAINT "curated_passages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_read_status" ADD CONSTRAINT "passage_read_status_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passage_read_status" ADD CONSTRAINT "passage_read_status_passage_id_curated_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."curated_passages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_line_progress" ADD CONSTRAINT "script_line_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_line_progress" ADD CONSTRAINT "script_line_progress_line_id_script_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."script_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "script_lines" ADD CONSTRAINT "script_lines_script_id_conversation_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."conversation_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_progress" ADD CONSTRAINT "typing_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_progress" ADD CONSTRAINT "typing_progress_sentence_id_typing_sentences_id_fk" FOREIGN KEY ("sentence_id") REFERENCES "public"."typing_sentences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "typing_sentences" ADD CONSTRAINT "typing_sentences_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audio_lesson_notes_user_lesson_idx" ON "audio_lesson_notes" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passage_read_status_user_passage_unique" ON "passage_read_status" USING btree ("user_id","passage_id");--> statement-breakpoint
CREATE INDEX "passage_read_status_user_id_idx" ON "passage_read_status" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "script_line_progress_user_line_unique" ON "script_line_progress" USING btree ("user_id","line_id");--> statement-breakpoint
CREATE INDEX "script_line_progress_user_id_idx" ON "script_line_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "script_lines_script_id_idx" ON "script_lines" USING btree ("script_id");--> statement-breakpoint
CREATE INDEX "script_lines_sort_order_idx" ON "script_lines" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "typing_progress_user_sentence_unique" ON "typing_progress" USING btree ("user_id","sentence_id");--> statement-breakpoint
CREATE INDEX "typing_progress_user_id_idx" ON "typing_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "typing_sentences_language_idx" ON "typing_sentences" USING btree ("language");--> statement-breakpoint
CREATE INDEX "typing_sentences_sort_order_idx" ON "typing_sentences" USING btree ("sort_order");