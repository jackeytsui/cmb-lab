CREATE TYPE "public"."xp_source" AS ENUM('lesson_complete', 'practice_exercise', 'practice_perfect', 'voice_conversation', 'daily_goal_met');--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"total_xp" integer DEFAULT 0 NOT NULL,
	"lesson_count" integer DEFAULT 0 NOT NULL,
	"practice_count" integer DEFAULT 0 NOT NULL,
	"conversation_count" integer DEFAULT 0 NOT NULL,
	"goal_xp" integer NOT NULL,
	"goal_met" boolean DEFAULT false NOT NULL,
	"streak_freeze_used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_activity_user_date_unique" UNIQUE("user_id","activity_date")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" "xp_source" NOT NULL,
	"amount" integer NOT NULL,
	"entity_id" uuid,
	"entity_type" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "longest_streak" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "xp_events" ADD CONSTRAINT "xp_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_activity_user_id_idx" ON "daily_activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "daily_activity_user_id_date_idx" ON "daily_activity" USING btree ("user_id","activity_date");--> statement-breakpoint
CREATE INDEX "xp_events_user_id_idx" ON "xp_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "xp_events_user_id_created_at_idx" ON "xp_events" USING btree ("user_id","created_at");