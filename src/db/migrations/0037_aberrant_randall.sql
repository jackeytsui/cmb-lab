CREATE TABLE IF NOT EXISTS "podcast_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"series_id" uuid NOT NULL,
	"token" text NOT NULL,
	CONSTRAINT "podcast_tokens_token_unique" UNIQUE("token"),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ghl_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ghl_location_id" text NOT NULL,
	"api_token" text NOT NULL,
	"webhook_secret" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ghl_locations_ghl_location_id_unique" UNIQUE("ghl_location_id")
);
--> statement-breakpoint
ALTER TABLE "ghl_contacts" DROP CONSTRAINT IF EXISTS "ghl_contacts_user_id_unique";--> statement-breakpoint
ALTER TABLE "ghl_contacts" DROP CONSTRAINT IF EXISTS "ghl_contacts_ghl_contact_id_unique";--> statement-breakpoint
ALTER TABLE "student_tags" ADD COLUMN IF NOT EXISTS "last_modified_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "listening_questions" ADD COLUMN IF NOT EXISTS "english_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "podcast_tokens" ADD CONSTRAINT "podcast_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "podcast_tokens" ADD CONSTRAINT "podcast_tokens_series_id_courses_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "podcast_tokens_user_series_idx" ON "podcast_tokens" USING btree ("user_id","series_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contacts_user_location_unique" ON "ghl_contacts" USING btree ("user_id","ghl_location_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ghl_contacts_ghl_contact_id_unique" ON "ghl_contacts" USING btree ("ghl_contact_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ghl_contacts_user_id_idx" ON "ghl_contacts" USING btree ("user_id");
