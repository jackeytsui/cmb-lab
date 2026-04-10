DO $$ BEGIN
  CREATE TYPE "course_library_lesson_type" AS ENUM ('video', 'text', 'quiz', 'download');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_library_courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"cover_image_url" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_library_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_library_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"module_id" uuid NOT NULL,
	"title" text NOT NULL,
	"lesson_type" "course_library_lesson_type" NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "course_library_lesson_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lesson_id" uuid NOT NULL,
	"completed_at" timestamp,
	"video_watched_percent" integer DEFAULT 0 NOT NULL,
	"quiz_score" integer,
	"quiz_answers" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course_library_courses" ADD CONSTRAINT "course_library_courses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course_library_modules" ADD CONSTRAINT "course_library_modules_course_id_course_library_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course_library_courses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course_library_lessons" ADD CONSTRAINT "course_library_lessons_module_id_course_library_modules_id_fk" FOREIGN KEY ("module_id") REFERENCES "public"."course_library_modules"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course_library_lesson_progress" ADD CONSTRAINT "course_library_lesson_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "course_library_lesson_progress" ADD CONSTRAINT "course_library_lesson_progress_lesson_id_course_library_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."course_library_lessons"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_courses_sort_idx" ON "course_library_courses" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_courses_published_idx" ON "course_library_courses" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_modules_course_idx" ON "course_library_modules" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_modules_sort_idx" ON "course_library_modules" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_lessons_module_idx" ON "course_library_lessons" USING btree ("module_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_lessons_sort_idx" ON "course_library_lessons" USING btree ("sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "course_library_lesson_progress_user_lesson_unique" ON "course_library_lesson_progress" USING btree ("user_id","lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "course_library_lesson_progress_user_idx" ON "course_library_lesson_progress" USING btree ("user_id");
