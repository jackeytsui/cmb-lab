CREATE TABLE "video_vocab_encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"video_session_id" uuid NOT NULL,
	"word" varchar(50) NOT NULL,
	"position_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_vocab_encounters_session_word" UNIQUE("video_session_id","word")
);
--> statement-breakpoint
ALTER TABLE "video_sessions" ADD COLUMN "last_position_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD COLUMN "video_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD COLUMN "total_watched_ms" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_sessions" ADD COLUMN "completion_percent" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "video_vocab_encounters" ADD CONSTRAINT "video_vocab_encounters_video_session_id_video_sessions_id_fk" FOREIGN KEY ("video_session_id") REFERENCES "public"."video_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "video_vocab_encounters_session_idx" ON "video_vocab_encounters" USING btree ("video_session_id");