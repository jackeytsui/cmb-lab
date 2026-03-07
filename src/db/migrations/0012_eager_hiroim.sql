CREATE TYPE "public"."caption_source" AS ENUM('youtube_auto', 'youtube_manual', 'upload_srt', 'upload_vtt');--> statement-breakpoint
CREATE TABLE "video_captions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_session_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"start_ms" integer NOT NULL,
	"end_ms" integer NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"youtube_video_id" varchar(11) NOT NULL,
	"youtube_url" text NOT NULL,
	"title" text,
	"caption_source" "caption_source",
	"caption_lang" varchar(10),
	"caption_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_sessions_user_video_unique" UNIQUE("user_id","youtube_video_id")
);
--> statement-breakpoint
ALTER TABLE "video_captions" ADD CONSTRAINT "video_captions_video_session_id_video_sessions_id_fk" FOREIGN KEY ("video_session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD CONSTRAINT "video_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_captions_session_idx" ON "video_captions" USING btree ("video_session_id");--> statement-breakpoint
CREATE INDEX "video_captions_session_seq_idx" ON "video_captions" USING btree ("video_session_id","sequence");--> statement-breakpoint
CREATE INDEX "video_sessions_user_id_idx" ON "video_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_sessions_youtube_video_id_idx" ON "video_sessions" USING btree ("youtube_video_id");