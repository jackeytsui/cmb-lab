DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'video_thread'
      AND enumtypid = (
        SELECT oid FROM pg_type WHERE typname = 'course_library_lesson_type'
      )
  ) THEN
    ALTER TYPE "course_library_lesson_type" ADD VALUE 'video_thread';
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_import_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "course_id" uuid NOT NULL REFERENCES "course_library_courses"("id") ON DELETE cascade,
  "created_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_import_projects_organization_unique" ON "videoask_import_projects"("organization_id");
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_import_projects_course_unique" ON "videoask_import_projects"("course_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_import_modules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "videoask_import_projects"("id") ON DELETE cascade,
  "source_folder_key" text NOT NULL,
  "source_folder_id" text,
  "source_folder_name" text,
  "module_id" uuid NOT NULL REFERENCES "course_library_modules"("id") ON DELETE cascade,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_import_modules_project_folder_unique" ON "videoask_import_modules"("project_id", "source_folder_key");
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_import_modules_module_unique" ON "videoask_import_modules"("module_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_form_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" uuid NOT NULL REFERENCES "videoask_import_projects"("id") ON DELETE cascade,
  "source_form_id" text NOT NULL,
  "source_form_title" text NOT NULL,
  "source_folder_key" text NOT NULL,
  "source_updated_at" timestamp,
  "status" text DEFAULT 'pending' NOT NULL,
  "thread_id" uuid REFERENCES "video_threads"("id") ON DELETE set null,
  "lesson_id" uuid REFERENCES "course_library_lessons"("id") ON DELETE set null,
  "source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_error" text,
  "imported_by" uuid REFERENCES "users"("id") ON DELETE set null,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_form_imports_project_form_unique" ON "videoask_form_imports"("project_id", "source_form_id");
CREATE INDEX IF NOT EXISTS "videoask_form_imports_status_idx" ON "videoask_form_imports"("status");
CREATE INDEX IF NOT EXISTS "videoask_form_imports_thread_idx" ON "videoask_form_imports"("thread_id");
CREATE INDEX IF NOT EXISTS "videoask_form_imports_lesson_idx" ON "videoask_form_imports"("lesson_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_step_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "form_import_id" uuid NOT NULL REFERENCES "videoask_form_imports"("id") ON DELETE cascade,
  "source_question_id" text NOT NULL,
  "source_media_id" text,
  "media_import_id" uuid,
  "step_id" uuid NOT NULL REFERENCES "video_thread_steps"("id") ON DELETE cascade,
  "source_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_step_imports_form_question_unique" ON "videoask_step_imports"("form_import_id", "source_question_id");
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_step_imports_step_unique" ON "videoask_step_imports"("step_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "videoask_media_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL,
  "source_media_key" text NOT NULL,
  "source_media_id" text,
  "source_url" text NOT NULL,
  "video_upload_id" uuid REFERENCES "video_uploads"("id") ON DELETE set null,
  "status" text DEFAULT 'pending' NOT NULL,
  "last_error" text,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "videoask_media_imports_organization_media_unique" ON "videoask_media_imports"("organization_id", "source_media_key");
CREATE INDEX IF NOT EXISTS "videoask_media_imports_video_upload_idx" ON "videoask_media_imports"("video_upload_id");
CREATE INDEX IF NOT EXISTS "videoask_media_imports_status_idx" ON "videoask_media_imports"("status");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "videoask_step_imports" ADD CONSTRAINT "videoask_step_imports_media_import_id_videoask_media_imports_id_fk" FOREIGN KEY ("media_import_id") REFERENCES "public"."videoask_media_imports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
