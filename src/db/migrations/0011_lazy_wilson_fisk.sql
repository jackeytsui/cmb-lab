CREATE TYPE "public"."dictionary_source" AS ENUM('cedict', 'canto', 'both');--> statement-breakpoint
CREATE TABLE "character_data" (
	"character" varchar(1) PRIMARY KEY NOT NULL,
	"pinyin" text[],
	"jyutping" text[],
	"radical" varchar(4),
	"radical_meaning" varchar(50),
	"stroke_count" smallint,
	"decomposition" varchar(100),
	"etymology_type" varchar(20),
	"etymology_hint" text,
	"etymology_phonetic" varchar(10),
	"etymology_semantic" varchar(10),
	"definition" text,
	"frequency_rank" integer,
	"stroke_paths" jsonb,
	"stroke_medians" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dictionary_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"traditional" varchar(50) NOT NULL,
	"simplified" varchar(50) NOT NULL,
	"pinyin" varchar(200) NOT NULL,
	"pinyin_display" varchar(200),
	"jyutping" varchar(200),
	"definitions" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" "dictionary_source" DEFAULT 'cedict' NOT NULL,
	"is_single_char" boolean DEFAULT false NOT NULL,
	"frequency_rank" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_vocabulary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"traditional" varchar(50) NOT NULL,
	"simplified" varchar(50) NOT NULL,
	"pinyin" varchar(200),
	"jyutping" varchar(200),
	"definitions" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_vocabulary" ADD CONSTRAINT "saved_vocabulary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_data_radical_idx" ON "character_data" USING btree ("radical");--> statement-breakpoint
CREATE INDEX "character_data_stroke_count_idx" ON "character_data" USING btree ("stroke_count");--> statement-breakpoint
CREATE INDEX "character_data_frequency_idx" ON "character_data" USING btree ("frequency_rank");--> statement-breakpoint
CREATE INDEX "dictionary_entries_traditional_idx" ON "dictionary_entries" USING btree ("traditional");--> statement-breakpoint
CREATE INDEX "dictionary_entries_simplified_idx" ON "dictionary_entries" USING btree ("simplified");--> statement-breakpoint
CREATE INDEX "dictionary_entries_pinyin_idx" ON "dictionary_entries" USING btree ("pinyin");--> statement-breakpoint
CREATE INDEX "saved_vocabulary_user_id_idx" ON "saved_vocabulary" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "saved_vocabulary_user_traditional_idx" ON "saved_vocabulary" USING btree ("user_id","traditional");