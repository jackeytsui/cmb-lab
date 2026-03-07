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
ALTER TABLE "video_thread_session_reviews" ADD CONSTRAINT "video_thread_session_reviews_session_id_video_thread_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."video_thread_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "video_thread_session_reviews" ADD CONSTRAINT "video_thread_session_reviews_coach_id_users_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "video_thread_session_reviews_session_idx" ON "video_thread_session_reviews" USING btree ("session_id");
--> statement-breakpoint
CREATE INDEX "video_thread_session_reviews_coach_idx" ON "video_thread_session_reviews" USING btree ("coach_id");
