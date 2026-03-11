CREATE TYPE "public"."engagement_event_type" AS ENUM('page_view', 'action', 'session_end');--> statement-breakpoint
CREATE TYPE "public"."engagement_feature" AS ENUM('ai_passage_reader', 'youtube_listening_lab', 'coaching_one_on_one', 'coaching_inner_circle');--> statement-breakpoint
CREATE TABLE "feature_engagement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feature" "engagement_feature" NOT NULL,
	"event_type" "engagement_event_type" NOT NULL,
	"action" text,
	"route" text,
	"session_key" text,
	"duration_ms" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_role_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" text NOT NULL,
	"feature_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "feature_engagement_events" ADD CONSTRAINT "feature_engagement_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feature_engagement_events_user_idx" ON "feature_engagement_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "feature_engagement_events_feature_idx" ON "feature_engagement_events" USING btree ("feature");--> statement-breakpoint
CREATE INDEX "feature_engagement_events_event_type_idx" ON "feature_engagement_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "feature_engagement_events_created_at_idx" ON "feature_engagement_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "feature_engagement_events_user_created_at_idx" ON "feature_engagement_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "platform_role_features_role_feature_unique" ON "platform_role_features" USING btree ("role","feature_key");--> statement-breakpoint
CREATE INDEX "platform_role_features_role_idx" ON "platform_role_features" USING btree ("role");