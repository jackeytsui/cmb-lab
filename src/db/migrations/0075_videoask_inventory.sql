CREATE TABLE IF NOT EXISTS "videoask_inventory_scans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "status" text DEFAULT 'scanning' NOT NULL,
  "form_count" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "videoask_inventory_scans_organization_idx" ON "videoask_inventory_scans"("organization_id");
CREATE INDEX IF NOT EXISTS "videoask_inventory_scans_status_idx" ON "videoask_inventory_scans"("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_inventory_forms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "source_form_id" text NOT NULL,
  "title" text NOT NULL,
  "folder_id" text,
  "folder_name" text,
  "share_url" text,
  "source_created_at" timestamp,
  "source_updated_at" timestamp,
  "last_scan_id" uuid NOT NULL REFERENCES "videoask_inventory_scans"("id") ON DELETE cascade,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_inventory_forms_organization_form_unique" ON "videoask_inventory_forms"("organization_id", "source_form_id");
CREATE INDEX IF NOT EXISTS "videoask_inventory_forms_scan_idx" ON "videoask_inventory_forms"("last_scan_id");
