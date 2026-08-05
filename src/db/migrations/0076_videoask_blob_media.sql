ALTER TABLE "videoask_media_imports"
  ADD COLUMN IF NOT EXISTS "storage_provider" text;
--> statement-breakpoint
ALTER TABLE "videoask_media_imports"
  ADD COLUMN IF NOT EXISTS "destination_url" text;
--> statement-breakpoint
ALTER TABLE "videoask_media_imports"
  ADD COLUMN IF NOT EXISTS "content_type" text;
--> statement-breakpoint
ALTER TABLE "videoask_media_imports"
  ADD COLUMN IF NOT EXISTS "size_bytes" bigint;
