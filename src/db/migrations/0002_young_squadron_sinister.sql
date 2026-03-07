CREATE TYPE "public"."upload_status" AS ENUM('pending', 'uploading', 'processing', 'ready', 'errored');--> statement-breakpoint
CREATE TYPE "public"."kb_entry_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."notification_category" AS ENUM('feedback', 'progress', 'system');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('coach_feedback', 'submission_graded', 'course_access', 'system');--> statement-breakpoint
CREATE TABLE "video_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mux_upload_id" text NOT NULL,
	"mux_asset_id" text,
	"mux_playback_id" text,
	"filename" text NOT NULL,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"duration_seconds" integer,
	"lesson_id" uuid,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "video_uploads_mux_upload_id_unique" UNIQUE("mux_upload_id")
);
--> statement-breakpoint
CREATE TABLE "kb_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kb_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "kb_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"file_source_id" uuid,
	"content" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"category_id" uuid,
	"status" "kb_entry_status" DEFAULT 'published' NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kb_file_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entry_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"processed_at" timestamp,
	"chunk_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category" "notification_category" NOT NULL,
	"muted" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"category" "notification_category" NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"link_url" text,
	"metadata" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "video_uploads" ADD CONSTRAINT "video_uploads_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_uploads" ADD CONSTRAINT "video_uploads_uploaded_by_users_clerk_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_entry_id_kb_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."kb_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_chunks" ADD CONSTRAINT "kb_chunks_file_source_id_kb_file_sources_id_fk" FOREIGN KEY ("file_source_id") REFERENCES "public"."kb_file_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_category_id_kb_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."kb_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_created_by_users_clerk_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("clerk_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entries" ADD CONSTRAINT "kb_entries_updated_by_users_clerk_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("clerk_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_file_sources" ADD CONSTRAINT "kb_file_sources_entry_id_kb_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."kb_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notification_prefs_user_idx" ON "notification_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "notifications_user_read_idx" ON "notifications" USING btree ("user_id","read");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");