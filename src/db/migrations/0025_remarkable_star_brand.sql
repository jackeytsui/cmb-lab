CREATE TYPE "public"."coaching_session_type" AS ENUM('one_on_one', 'inner_circle');--> statement-breakpoint
CREATE TABLE "coaching_note_stars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"pane" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"text_override" text,
	"romanization_override" text,
	"translation_override" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coaching_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "coaching_session_type" NOT NULL,
	"title" text NOT NULL,
	"student_email" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_url" text NOT NULL,
	"youtube_video_id" varchar(11) NOT NULL,
	"video_title" text NOT NULL,
	"channel_name" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admin_api_keys_key_prefix_unique" UNIQUE("key_prefix"),
	CONSTRAINT "admin_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "coaching_note_stars" ADD CONSTRAINT "coaching_note_stars_note_id_coaching_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."coaching_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_note_stars" ADD CONSTRAINT "coaching_note_stars_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_notes" ADD CONSTRAINT "coaching_notes_session_id_coaching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coaching_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_sessions" ADD CONSTRAINT "coaching_sessions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_recommendations" ADD CONSTRAINT "listening_recommendations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_api_keys" ADD CONSTRAINT "admin_api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coaching_note_stars_note_idx" ON "coaching_note_stars" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "coaching_note_stars_user_idx" ON "coaching_note_stars" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "coaching_notes_session_idx" ON "coaching_notes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "coaching_notes_order_idx" ON "coaching_notes" USING btree ("order");--> statement-breakpoint
CREATE INDEX "coaching_sessions_type_idx" ON "coaching_sessions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "coaching_sessions_student_email_idx" ON "coaching_sessions" USING btree ("student_email");--> statement-breakpoint
CREATE INDEX "coaching_sessions_created_by_idx" ON "coaching_sessions" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "listening_recommendations_video_id_unique" ON "listening_recommendations" USING btree ("youtube_video_id");--> statement-breakpoint
CREATE INDEX "listening_recommendations_created_at_idx" ON "listening_recommendations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_api_keys_created_at_idx" ON "admin_api_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_api_keys_revoked_at_idx" ON "admin_api_keys" USING btree ("revoked_at");