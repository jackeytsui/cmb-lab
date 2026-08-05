CREATE TABLE IF NOT EXISTS "videoask_integration" (
	"id" text PRIMARY KEY DEFAULT 'primary' NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"access_token_expires_at" timestamp NOT NULL,
	"scope" text,
	"connected_by" uuid,
	"last_validated_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videoask_integration" ADD CONSTRAINT "videoask_integration_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videoask_integration_organization_idx" ON "videoask_integration" USING btree ("organization_id");
