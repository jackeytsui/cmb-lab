CREATE TYPE "public"."tag_type" AS ENUM('coach', 'system');--> statement-breakpoint
CREATE TYPE "public"."assignment_target_type" AS ENUM('course', 'module', 'lesson', 'student', 'tag');--> statement-breakpoint
CREATE TYPE "public"."exercise_type" AS ENUM('multiple_choice', 'fill_in_blank', 'matching', 'ordering', 'audio_recording', 'free_text');--> statement-breakpoint
CREATE TYPE "public"."practice_set_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "auto_tag_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_id" uuid NOT NULL,
	"condition_type" text NOT NULL,
	"condition_value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"type" "tag_type" DEFAULT 'coach' NOT NULL,
	"description" text,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bulk_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operation_type" text NOT NULL,
	"target_id" text NOT NULL,
	"student_ids" jsonb NOT NULL,
	"succeeded_ids" jsonb NOT NULL,
	"performed_by" uuid NOT NULL,
	"undone_at" timestamp,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "filter_presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practice_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_set_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"score" integer,
	"total_exercises" integer NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"results" jsonb
);
--> statement-breakpoint
CREATE TABLE "practice_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_set_id" uuid NOT NULL,
	"type" "exercise_type" NOT NULL,
	"language" "interaction_language" NOT NULL,
	"definition" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "practice_set_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"practice_set_id" uuid NOT NULL,
	"target_type" "assignment_target_type" NOT NULL,
	"target_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "practice_set_assignments_unique" UNIQUE("practice_set_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "practice_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "practice_set_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "ghl_contacts" ADD COLUMN "cached_data" jsonb;--> statement-breakpoint
ALTER TABLE "ghl_contacts" ADD COLUMN "last_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "auto_tag_rules" ADD CONSTRAINT "auto_tag_rules_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auto_tag_rules" ADD CONSTRAINT "auto_tag_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tags" ADD CONSTRAINT "student_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tags" ADD CONSTRAINT "student_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_tags" ADD CONSTRAINT "student_tags_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bulk_operations" ADD CONSTRAINT "bulk_operations_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "filter_presets" ADD CONSTRAINT "filter_presets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_attempts" ADD CONSTRAINT "practice_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_exercises" ADD CONSTRAINT "practice_exercises_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_assignments" ADD CONSTRAINT "practice_set_assignments_practice_set_id_practice_sets_id_fk" FOREIGN KEY ("practice_set_id") REFERENCES "public"."practice_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_set_assignments" ADD CONSTRAINT "practice_set_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sets" ADD CONSTRAINT "practice_sets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "student_tags_user_tag_unique" ON "student_tags" USING btree ("user_id","tag_id");