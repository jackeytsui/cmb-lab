CREATE TABLE "coaching_session_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "assigned_coach_id" uuid;--> statement-breakpoint
ALTER TABLE "coaching_session_ratings" ADD CONSTRAINT "coaching_session_ratings_session_id_coaching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."coaching_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coaching_session_ratings" ADD CONSTRAINT "coaching_session_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coaching_session_ratings_session_user_idx" ON "coaching_session_ratings" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "coaching_session_ratings_session_idx" ON "coaching_session_ratings" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "coaching_session_ratings_user_idx" ON "coaching_session_ratings" USING btree ("user_id");